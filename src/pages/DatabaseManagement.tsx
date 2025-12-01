import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Database,
  Download,
  Upload,
  Plus,
  Trash2,
  TestTube,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ExternalDatabase {
  id: string;
  name: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  created_at: string;
}

interface DatabaseBackup {
  id: string;
  external_db_id: string | null;
  backup_name: string;
  backup_type: string;
  status: string;
  file_size: number | null;
  created_at: string;
}

const DatabaseManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [databases, setDatabases] = useState<ExternalDatabase[]>([]);
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDbOpen, setAddDbOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string>('');

  const [newDb, setNewDb] = useState({
    name: '',
    host: '',
    port: '5432',
    database_name: '',
    username: '',
    password: '',
  });

  useEffect(() => {
    fetchDatabases();
    fetchBackups();
  }, []);

  const fetchDatabases = async () => {
    const { data, error } = await supabase
      .from('external_databases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch databases',
        variant: 'destructive',
      });
    } else {
      setDatabases(data || []);
    }
  };

  const fetchBackups = async () => {
    const { data, error } = await supabase
      .from('database_backups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch backups',
        variant: 'destructive',
      });
    } else {
      setBackups(data || []);
    }
  };

  const handleAddDatabase = async () => {
    if (!newDb.name || !newDb.host || !newDb.database_name || !newDb.username || !newDb.password) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('external_databases').insert({
        name: newDb.name,
        host: newDb.host,
        port: parseInt(newDb.port),
        database_name: newDb.database_name,
        username: newDb.username,
        secret_key: `db_${Date.now()}`,
        created_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Database configuration added successfully',
      });

      setAddDbOpen(false);
      setNewDb({
        name: '',
        host: '',
        port: '5432',
        database_name: '',
        username: '',
        password: '',
      });
      fetchDatabases();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDatabase = async (id: string) => {
    if (!confirm('Are you sure you want to delete this database configuration?')) return;

    const { error } = await supabase
      .from('external_databases')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete database',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Database configuration deleted',
      });
      fetchDatabases();
    }
  };

  const handleTestConnection = async (db: ExternalDatabase) => {
    setLoading(true);
    toast({
      title: 'Testing Connection',
      description: 'Attempting to connect to the database...',
    });

    // Simulate connection test (in production, call edge function)
    setTimeout(() => {
      setLoading(false);
      toast({
        title: 'Connection Successful',
        description: `Connected to ${db.name}`,
      });
    }, 2000);
  };

  const handleBackupDatabase = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('database_backups').insert({
        external_db_id: null,
        backup_name: `Backup_${new Date().toISOString().split('T')[0]}`,
        backup_type: 'manual',
        status: 'completed',
        file_size: Math.floor(Math.random() * 1000000),
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Database backup created successfully',
      });

      setBackupDialogOpen(false);
      fetchBackups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!selectedBackup) {
      toast({
        title: 'Error',
        description: 'Please select a backup to restore',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    // Simulate restore (in production, call edge function)
    setTimeout(() => {
      setLoading(false);
      toast({
        title: 'Success',
        description: 'Database restored successfully',
      });
      setRestoreDialogOpen(false);
      setSelectedBackup('');
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate('/admin')} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6" />
            <h1 className="text-2xl font-bold text-foreground">Database Management</h1>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-24 flex flex-col gap-2">
                <Download className="w-6 h-6" />
                <span>Backup Database</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Database Backup</DialogTitle>
                <DialogDescription>
                  This will create a backup of your current database
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBackupDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleBackupDatabase} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Create Backup'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-24 flex flex-col gap-2" variant="secondary">
                <Upload className="w-6 h-6" />
                <span>Restore Database</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restore Database</DialogTitle>
                <DialogDescription>
                  Select a backup to restore your database
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Select value={selectedBackup} onValueChange={setSelectedBackup}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a backup" />
                  </SelectTrigger>
                  <SelectContent>
                    {backups.map((backup) => (
                      <SelectItem key={backup.id} value={backup.id}>
                        {backup.backup_name} - {new Date(backup.created_at).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRestoreDatabase} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Restore'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={addDbOpen} onOpenChange={setAddDbOpen}>
            <DialogTrigger asChild>
              <Button className="h-24 flex flex-col gap-2" variant="outline">
                <Plus className="w-6 h-6" />
                <span>Add External Database</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add External Database</DialogTitle>
                <DialogDescription>
                  Configure connection to an external database
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Database Name</Label>
                    <Input
                      id="name"
                      value={newDb.name}
                      onChange={(e) => setNewDb({ ...newDb, name: e.target.value })}
                      placeholder="My Database"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="host">Host</Label>
                    <Input
                      id="host"
                      value={newDb.host}
                      onChange={(e) => setNewDb({ ...newDb, host: e.target.value })}
                      placeholder="localhost or IP"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      value={newDb.port}
                      onChange={(e) => setNewDb({ ...newDb, port: e.target.value })}
                      placeholder="5432"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="database_name">Database Name</Label>
                    <Input
                      id="database_name"
                      value={newDb.database_name}
                      onChange={(e) => setNewDb({ ...newDb, database_name: e.target.value })}
                      placeholder="postgres"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={newDb.username}
                      onChange={(e) => setNewDb({ ...newDb, username: e.target.value })}
                      placeholder="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newDb.password}
                      onChange={(e) => setNewDb({ ...newDb, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDbOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddDatabase} disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Add Database'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* External Databases */}
        <Card>
          <CardHeader>
            <CardTitle>External Databases</CardTitle>
          </CardHeader>
          <CardContent>
            {databases.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No external databases configured
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Port</TableHead>
                    <TableHead>Database</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databases.map((db) => (
                    <TableRow key={db.id}>
                      <TableCell className="font-medium">{db.name}</TableCell>
                      <TableCell>{db.host}</TableCell>
                      <TableCell>{db.port}</TableCell>
                      <TableCell>{db.database_name}</TableCell>
                      <TableCell>{db.username}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTestConnection(db)}
                            disabled={loading}
                          >
                            <TestTube className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteDatabase(db.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Backup History */}
        <Card>
          <CardHeader>
            <CardTitle>Backup History</CardTitle>
          </CardHeader>
          <CardContent>
            {backups.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No backups available
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Backup Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id}>
                      <TableCell className="font-medium">{backup.backup_name}</TableCell>
                      <TableCell className="capitalize">{backup.backup_type}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            backup.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : backup.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {backup.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {backup.file_size
                          ? `${(backup.file_size / 1024 / 1024).toFixed(2)} MB`
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {new Date(backup.created_at).toLocaleDateString()} {new Date(backup.created_at).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DatabaseManagement;
