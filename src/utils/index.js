export function createPageUrl(page) {
  if (!page) return "/";
  const map = {
    Home: "/Home",
    Store: "/Store",
    Profile: "/Profile",
    Admin: "/Admin",
    Trending: "/Trending",
    Following: "/Following",
    Messages: "/Messages",
    GoLive: "/GoLive",
    PublicProfile: "/PublicProfile",
    StreamViewer: "/StreamViewer",
    Notifications: "/Notifications",
    NotificationsPage: "/NotificationsPage",
    ManualCoinsPayment: "/ManualCoinsPayment",
    "Manual Coins Payment": "/ManualCoinsPayment",
    Login: "/Login",
    TrollOfficerApplication: "/TrollOfficerApplication",
    TrollFamilyApplication: "/TrollFamilyApplication",
  };
  return map[page] || `/${String(page)}`;
}
