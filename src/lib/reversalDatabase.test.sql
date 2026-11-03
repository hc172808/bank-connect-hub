-- Run through the privileged database query tool. All test changes roll back.
-- Never calls approval/processing, never updates wallets or creates transfers.
BEGIN;
DO $$
DECLARE
  t public.transactions%ROWTYPE;
  admin_id uuid;
  other_id uuid;
  result jsonb;
  reversal_id uuid;
  balances_before jsonb;
  transfers_before bigint;
  row_data public.fund_reversals%ROWTYPE;
BEGIN
  SELECT * INTO STRICT t FROM public.transactions x
  WHERE x.status='completed' AND x.transaction_type='transfer'
    AND x.amount>0 AND x.sender_id<>x.receiver_id
    AND NOT EXISTS (SELECT 1 FROM public.fund_reversals r WHERE r.transaction_id=x.id
      AND r.status IN ('pending','approved','completed'))
  ORDER BY x.created_at DESC LIMIT 1;
  SELECT user_id INTO STRICT admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  SELECT p.id INTO STRICT other_id FROM public.profiles p WHERE p.id<>t.sender_id
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id
      AND r.role::text IN ('admin','agent','founder')) LIMIT 1;
  SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id) INTO balances_before FROM public.wallets w;
  SELECT count(*) INTO transfers_before FROM public.transactions;

  PERFORM set_config('request.jwt.claim.sub', other_id::text, true);
  result:=public.request_fund_reversal(t.id,NULL);
  IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Another sender was allowed'; END IF;

  PERFORM set_config('request.jwt.claim.sub', t.sender_id::text, true);
  result:=public.request_fund_reversal(t.id,repeat('x',501));
  IF result->>'success'<>'false' THEN RAISE EXCEPTION '501-character reason was allowed'; END IF;
  result:=public.request_fund_reversal(t.id,'Rollback-only reversal verification');
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Request failed: %',result; END IF;
  reversal_id:=(result->>'reversal_id')::uuid;
  SELECT * INTO STRICT row_data FROM public.fund_reversals WHERE id=reversal_id;
  IF row_data.amount<>t.amount OR row_data.requester_id<>t.sender_id
     OR row_data.recipient_id<>t.receiver_id OR row_data.status<>'pending' THEN
    RAISE EXCEPTION 'Request details do not match original transfer';
  END IF;
  result:=public.request_fund_reversal(t.id,NULL);
  IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Duplicate request allowed'; END IF;

  PERFORM set_config('request.jwt.claim.sub',other_id::text,true);
  result:=public.reject_fund_reversal(reversal_id);
  IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Non-staff rejection allowed'; END IF;

  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  result:=public.reject_fund_reversal(reversal_id);
  IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Admin rejection failed: %',result; END IF;
  SELECT * INTO STRICT row_data FROM public.fund_reversals WHERE id=reversal_id;
  IF row_data.status<>'rejected' OR row_data.approved_by<>admin_id
     OR row_data.funds_held_at IS NOT NULL OR row_data.funds_returned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Incorrect rejection state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id=t.sender_id
    AND title='Reversal request rejected' AND created_at>=transaction_timestamp()) THEN
    RAISE EXCEPTION 'Missing rejection notification';
  END IF;
  result:=public.reject_fund_reversal(reversal_id);
  IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Repeated rejection allowed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',t.sender_id::text,true);
  result:=public.request_fund_reversal(t.id,NULL);
  IF result->>'success'<>'true' OR (result->>'reversal_id')::uuid=reversal_id THEN
    RAISE EXCEPTION 'Request after rejection failed';
  END IF;
  IF has_table_privilege('authenticated','public.fund_reversals','INSERT')
     OR has_table_privilege('authenticated','public.fund_reversals','UPDATE') THEN
    RAISE EXCEPTION 'Direct reversal writes are permitted';
  END IF;
  IF balances_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id) FROM public.wallets w)
     OR transfers_before<>(SELECT count(*) FROM public.transactions) THEN
    RAISE EXCEPTION 'Real funds or transfer ledger changed';
  END IF;
END;
$$;
ROLLBACK;