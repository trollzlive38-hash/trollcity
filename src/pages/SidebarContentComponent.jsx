import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Home, Heart, MessageCircle, Bell, ShoppingBag, Sparkles, Crown,
  Calendar, DollarSign, Users, Shield, Swords, Radio, Dices
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function SidebarContentComponent({ user }) {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const [latestGift, setLatestGift] = useState(null);
  const queryClient = useQueryClient();

  const getTierInfo = (level) => {
    if (level >= 1 && level <= 9) return { tier: 1, color: "from-gray-500 to-slate-500" };
    if (level >= 10 && level <= 19) return { tier: 2, color: "from-blue-500 to-cyan-500" };
    if (level >= 20 && level <= 29) return { tier: 3, color: "from-purple-500 to-pink-500" };
    if (level >= 30) return { tier: 4, color: "from-yellow-500 to-orange-500" };
    return { tier: 1, color: "from-gray-500 to-slate-500" };
  };
  const userLevel = user?.level || 1;
  const tierInfo = getTierInfo(userLevel);

  // --- Notifications ---
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unreadNotifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data, error } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
      return (data || []).length;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  // --- Messages ---
  const { data: unreadMessagesCount = 0 } = useQuery({
    queryKey: ["unreadMessages", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data: convsAsP1 } = await supabase
        .from("conversations")
        .select("*")
        .eq("participant1_id", user.id);
      const { data: convsAsP2 } = await supabase
        .from("conversations")
        .select("*")
        .eq("participant2_id", user.id);

      const totalUnread = [
        ...(convsAsP1 || []).map(c => c.unread_count_p1 || 0),
        ...(convsAsP2 || []).map(c => c.unread_count_p2 || 0),
      ].reduce((sum, c) => sum + c, 0);

      return totalUnread;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  // --- Gifts ---
  const { data: recentGifts = [] } = useQuery({
    queryKey: ["recentGifts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("stream_gifts")
        .select("*")
        .eq("recipient_id", user.id)
        .order("created_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (recentGifts.length > 0) {
      const newest = recentGifts[0];
      if (!latestGift || newest.id !== latestGift.id) {
        setLatestGift(newest);
        toast.success(`🎁 ${newest.sender_name} sent you ${newest.gift_emoji} ${newest.gift_name}!`, { duration: 5000 });
        queryClient.invalidateQueries(["currentUser"]);
      }
    }
  }, [recentGifts, latestGift, queryClient]);

  const handleLinkClick = () => setOpenMobile(false);

  const mainNavItems = [
    { title: "Home", url: createPageUrl("Home"), icon: Home },
    { title: "Following", url: createPageUrl("Following"), icon: Heart },
    { title: "Messages", url: createPageUrl("Messages"), icon: MessageCircle, badge: unreadMessagesCount },
    { title: "Notifications", url: createPageUrl("Notifications"), icon: Bell, badge: unreadCount },
  ];

  const monetizationNavItems = [
    { title: "Store", url: createPageUrl("Store"), icon: ShoppingBag },
    { title: "Gamble", url: createPageUrl("Gamble"), icon: Dices },
    { title: "Subscriptions", url: createPageUrl("Subscriptions"), icon: Crown },
    { title: "Daily Rewards", url: createPageUrl("Rewards"), icon: Calendar },
    { title: "Earnings", url: createPageUrl("Earnings"), icon: DollarSign },
  ];

  const adminNavItems = [
    { title: "Earnings", url: createPageUrl("Earnings"), icon: DollarSign },
    // Route fixes: use explicit paths matching App.jsx
    { title: "Admin Dashboard", url: "/AdminDashboard", icon: Shield },
    { title: "Send Invite", url: "/AdminInvite", icon: Users },
    { title: "Admin Live Control", url: "/AdminLiveControl", icon: Radio },
    { title: "Lives Overview", url: "/AdminLives", icon: Radio },
    { title: "Trollers", url: "/Trollers", icon: Users },
    { title: "T-O Command", url: "/TOCommand", icon: Swords },
    { title: "Troll Officer App", url: "/OfficerApp", icon: Swords },
    { title: "Troll Family App", url: "/FamilyApp", icon: Users },
    { title: "AI Console", url: "/AdminAI", icon: Sparkles },
  ];

  // Extra nav for Officers (visible to admins and troll officers)
  const officerNavItems = [
    { title: "Troll Officers", url: "/TrollOfficers", icon: Shield },
    { title: "Family Payouts", url: "/FamilyPayouts", icon: Users },
  ];

  const renderNavItems = items =>
    items.map(item => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          className={`hover:bg-purple-500/20 transition-all duration-200 rounded-xl ${
            location.pathname === item.url
              ? "bg-purple-500/30 text-white"
              : "bg-[#111] text-gray-300 hover:text-white"
          }`}
        >
          <Link to={item.url} onClick={handleLinkClick} className="flex items-center gap-3 px-4 py-3 relative">
            <item.icon className="w-5 h-5" />
            <span>{item.title}</span>
            {item.badge > 0 && (
              <Badge className="ml-auto bg-red-500 text-white h-5 min-w-[20px] flex items-center justify-center px-1.5">
                {item.badge > 99 ? "99+" : item.badge}
              </Badge>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar className="border-r bg-gradient-to-b from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] text-gray-200">
      <SidebarHeader className="border-b border-white/10 p-6 bg-transparent">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <span className="text-xl font-bold text-white">T</span>
            </div>
            <span className="font-bold text-lg">
              <span className="text-emerald-400">Troll</span>
              <span className="text-cyan-400">City</span>
            </span>
          </div>

          <Link to={createPageUrl("GoLive")} onClick={handleLinkClick}>
            <Button className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600">
              <Radio className="w-4 h-4 mr-2" />
              Go Live
            </Button>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="p-3 bg-transparent text-gray-200">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{renderNavItems(mainNavItems)}</SidebarMenu>
            <SidebarMenu>{renderNavItems(monetizationNavItems)}</SidebarMenu>
            {(user?.is_admin || user?.role === 'admin') && (
              <SidebarMenu>{renderNavItems(adminNavItems)}</SidebarMenu>
            )}
            {(user?.is_troll_officer || user?.role === 'admin' || user?.is_admin) && (
              <SidebarMenu>
                {renderNavItems(officerNavItems)}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {user && (
          <>
            <SidebarGroup className="mt-4">
              <Link to={createPageUrl("Store")} onClick={handleLinkClick}>
                <div className="px-4 py-3 rounded-xl cursor-pointer hover:bg-yellow-500/10 transition-all" style={{ background: "rgba(234, 179, 8, 0.1)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">My Coins</span>
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {(user.coins || 0).toLocaleString()} 
                  </div>
                  <div className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3" />
                    Buy More
                  </div>
                </div>
              </Link>
            </SidebarGroup>

            <SidebarGroup className="mt-4">
              <div className="px-4 py-3 rounded-xl" style={{ background: "rgba(168, 85, 247, 0.1)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Level & Tier</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-2xl font-bold bg-gradient-to-r ${tierInfo.color} bg-clip-text text-transparent`}>
                    {userLevel}
                  </div>
                  <Badge className={`bg-gradient-to-r ${tierInfo.color} border-0 text-white text-xs`}>
                    Tier {tierInfo.tier}
                  </Badge>
                </div>
              </div>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* ✅ Footer with login/logout */}
      <SidebarFooter className="border-t border-white/10 p-4 bg-gradient-to-r from-[#0a0a0f]/70 to-[#1a0a1f]/70 backdrop-blur-md">
        {user ? (
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={user?.avatar || user?.user_metadata?.avatar_url || "https://placehold.co/40x40"}
                  alt="avatar"
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-500/30 shadow-lg"
                />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border border-black"></div>
              </div>
              <div className="flex flex-col min-w-0">
                <p className="font-semibold text-sm text-white truncate">@{user?.username || user?.user_metadata?.user_name || user?.full_name || "User"}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email || user?.user_metadata?.email || ""}</p>
                <p className="text-[11px] text-gray-500 truncate">Level {user?.level || 1} • Status: {user?.is_banned ? 'Banned' : (user?.role === 'admin' || user?.is_admin) ? 'Admin' : user?.is_troll_officer ? 'Troll Officer' : user?.is_og ? 'OG' : 'Member'}</p>
              </div>
            </div>

            <Button
              type="button"
              onClick={async () => await supabase.auth.signOut()}
              className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
            >
              Logout
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <span className="text-xl font-bold text-white">T</span>
              </div>
              <div className="flex flex-col">
                <p className="font-semibold text-sm text-white">Welcome to TrollCity</p>
                <p className="text-xs text-gray-400">Sign in to access all features</p>
              </div>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
