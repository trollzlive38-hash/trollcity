import Layout from "./Layout.jsx";

import Home from "./Home";
import Store from "./Store";
import StreamViewer from "./StreamViewer";
import GoLive from "./GoLive";
import ProfileSetup from "./ProfileSetup";
import Profile from "./Profile";
import Trending from "./Trending";
import Following from "./Following";
import BroadcasterApplication from "./BroadcasterApplication";
import PublicProfile from "./PublicProfile";
import ManualCoinsPayment from "./ManualCoinsPayment";
import Notifications from "./Notifications";
import NotificationsPage from "./NotificationsPage";
import AdminDashboardPage from "./AdminDashboardPage.jsx";
import LoginPage from "./LoginPage";
import React, { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from "@/api/supabaseClient";

const PAGES = {
    Home: Home,
    Store: Store,
    StreamViewer: StreamViewer,
    GoLive: GoLive,
    ProfileSetup: ProfileSetup,
    Profile: Profile,
    Trending: Trending,
    Following: Following,
    BroadcasterApplication: BroadcasterApplication,
    PublicProfile: PublicProfile,
    ManualCoinsPayment: ManualCoinsPayment,
    Notifications: Notifications,
    NotificationsPage: NotificationsPage,
    Admin: AdminDashboardPage,
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const queryClient = useQueryClient();
    // Track raw auth session separately so we don't block rendering
    const { data: authUser, isLoading: authLoading } = useQuery({
      queryKey: ["authUser"],
      queryFn: async () => {
        const { data } = await supabase.auth.getUser();
        return data?.user || null;
      },
      staleTime: 1000,
    });
    const attemptedAutoLoginRef = useRef(false);

    // Keep auth-aware queries fresh when the session changes
    useEffect(() => {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        try { queryClient.invalidateQueries({ queryKey: ["authUser"] }); } catch {}
      });
      return () => {
        try { listener.subscription.unsubscribe(); } catch {}
      };
    }, [queryClient]);

    // Dev-only auto-login using env credentials
    useEffect(() => {
      const autoEmail = import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL || null;
      const autoPass = import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD || null;
      const isLoginRoute = location.pathname.toLowerCase() === "/login";

      if (
        !authLoading && !authUser &&
        !attemptedAutoLoginRef.current &&
        supabase.__isConfigured &&
        autoEmail && autoPass &&
        !isLoginRoute
      ) {
        attemptedAutoLoginRef.current = true;
        supabase.auth
          .signInWithPassword({ email: autoEmail, password: autoPass })
          .catch((e) => {
            console.warn("Auto-login failed:", e?.message || e);
            attemptedAutoLoginRef.current = true;
          });
      }
    }, [authLoading, authUser, location.pathname]);
    const currentPage = _getCurrentPage(location.pathname);
    
    // If there is no authenticated session, show Login screen when not on /login
    if (!authLoading && !authUser && location.pathname.toLowerCase() !== "/login") {
      return <LoginPage />;
    }

    return (
        <Layout currentPageName={currentPage}>
            <Routes>
                <Route path="/Login" element={<LoginPage />} />
                <Route path="/login" element={<LoginPage />} />            
                <Route path="/" element={<Home />} />
                <Route path="/Home" element={<Home />} />
                <Route path="/Store" element={<Store />} />
                <Route path="/StreamViewer" element={<StreamViewer />} />
                <Route path="/GoLive" element={<GoLive />} />
                <Route path="/ProfileSetup" element={<ProfileSetup />} />
                <Route path="/Profile" element={<Profile />} />
                <Route path="/Trending" element={<Trending />} />
                <Route path="/Following" element={<Following />} />
                <Route path="/BroadcasterApplication" element={<BroadcasterApplication />} />
                <Route path="/PublicProfile" element={<PublicProfile />} />
                <Route path="/manual-coins-payment" element={<ManualCoinsPayment />} />
                <Route path="/ManualCoinsPayment" element={<ManualCoinsPayment />} />
                <Route path="/Notifications" element={<Notifications />} />
                <Route path="/NotificationsPage" element={<NotificationsPage />} />
                <Route path="/Admin" element={<AdminDashboardPage />} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}
