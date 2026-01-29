import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function NotificationBell() {
  const result = useQuery(api.example.list, {});
  const unreadCount = useQuery(api.example.unreadCount, {});
  const markRead = useMutation(api.example.markRead);
  const markAllRead = useMutation(api.example.markAllRead);
  const archiveNotification = useMutation(api.example.archive);

  const notifications = result?.notifications ?? [];

  return (
    <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px" }}>
      <h3>Notifications ({unreadCount ?? 0} unread)</h3>
      <button onClick={() => markAllRead({})}>Mark all as read</button>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {notifications.map((n: any) => (
          <li
            key={n._id}
            style={{
              padding: "0.5rem",
              backgroundColor: n.readAt ? "#f5f5f5" : "#e3f2fd",
              marginBottom: "0.5rem",
              borderRadius: "4px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>{n.title}</strong>
              <p style={{ margin: "0.25rem 0 0" }}>{n.body}</p>
            </div>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {!n.readAt && (
                <button onClick={() => markRead({ notificationId: n._id })}>
                  Read
                </button>
              )}
              <button onClick={() => archiveNotification({ notificationId: n._id })}>
                Archive
              </button>
            </div>
          </li>
        ))}
        {notifications.length === 0 && (
          <li style={{ color: "#888", fontStyle: "italic" }}>No notifications.</li>
        )}
      </ul>
    </div>
  );
}

function SendDemo() {
  const sendWelcome = useMutation(api.example.sendTestNotification);
  const sendReply = useMutation(api.example.sendCommentReply);

  return (
    <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px", marginTop: "1rem" }}>
      <h3>Send Test Notifications</h3>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={() => sendWelcome({ data: { userName: "Demo User" } })}>Send Welcome</button>
        <button
          onClick={() =>
            sendReply({
              data: {
                commenterName: "Alice",
                postTitle: "Example Post",
              },
            })
          }
        >
          Send Comment Reply
        </button>
      </div>
    </div>
  );
}

function PreferencesPanel() {
  const preferences = useQuery(api.example.getPreferences, {});
  const updatePref = useMutation(api.example.updatePreference);

  return (
    <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px", marginTop: "1rem" }}>
      <h3>Preferences</h3>
      <div style={{ display: "flex", gap: "1rem" }}>
        {["email", "push", "sms"].map((channel) => {
          const pref = (preferences ?? []).find(
            (p: any) => p.level === "global" && p.channel === channel,
          );
          return (
            <label key={channel}>
              <input
                type="checkbox"
                checked={pref ? pref.enabled : true}
                onChange={(e) =>
                  updatePref({
                    level: "global" as const,
                    channel,
                    enabled: e.target.checked,
                  })
                }
              />
              {channel}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  return (
    <>
      <h1>Convex Notifications Example</h1>
      <div className="card">
        <NotificationBell />
        <SendDemo />
        <PreferencesPanel />
      </div>
    </>
  );
}

export default App;
