import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Bell, CheckCircle, AlertCircle, Info } from "lucide-react";

const notifications = [
  {
    id: 1,
    type: "success",
    title: "Payment Received",
    message: "You received $50.00 from John Doe",
    time: "2 hours ago",
    read: false,
  },
  {
    id: 2,
    type: "info",
    title: "Welcome to GYD Wallet",
    message: "Your account has been created successfully",
    time: "1 day ago",
    read: true,
  },
  {
    id: 3,
    type: "alert",
    title: "Security Alert",
    message: "New login detected from a new device",
    time: "2 days ago",
    read: true,
  },
];

const Notifications = () => {
  const navigate = useNavigate();

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="text-green-500" size={20} />;
      case "alert":
        return <AlertCircle className="text-destructive" size={20} />;
      default:
        return <Info className="text-primary" size={20} />;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/client")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Notifications</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell size={20} />
              All Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex gap-3 p-3 rounded-xl ${
                      notification.read ? "bg-muted/30" : "bg-primary/10"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center flex-shrink-0">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{notification.title}</p>
                        {!notification.read && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {notification.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Notifications;
