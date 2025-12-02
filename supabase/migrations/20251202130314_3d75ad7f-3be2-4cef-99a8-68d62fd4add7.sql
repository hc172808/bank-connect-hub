-- Create external_databases table
CREATE TABLE public.external_databases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 5432,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  secret_key TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create database_backups table
CREATE TABLE public.database_backups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_db_id UUID REFERENCES public.external_databases(id) ON DELETE SET NULL,
  backup_name TEXT NOT NULL,
  backup_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  file_size BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_databases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_backups ENABLE ROW LEVEL SECURITY;

-- RLS policies for external_databases (admin only)
CREATE POLICY "Admins can manage external databases"
  ON public.external_databases
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS policies for database_backups (admin only)
CREATE POLICY "Admins can manage database backups"
  ON public.database_backups
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));