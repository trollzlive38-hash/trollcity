import Layout from "./Layout.jsx";

import Home from "./Home";

import Store from "./Store";

import StreamViewer from "./StreamViewer";

import Subscriptions from "./Subscriptions";

import Rewards from "./Rewards";

import Messages from "./Messages";

import GoLive from "./GoLive";

import Earnings from "./Earnings";

import ProfileSetup from "./ProfileSetup";

import Profile from "./Profile";

import Trending from "./Trending";

import Following from "./Following";

import TrollOfficerApplication from "./TrollOfficerApplication";

import Admin from "./Admin";


import Notifications from "./Notifications";

import Disclaimer from "./Disclaimer";

import Safety from "./Safety";

import Privacy from "./Privacy";

import TrollFamilyApplication from "./TrollFamilyApplication";

import BroadcasterApplication from "./BroadcasterApplication";

import OfficerChat from "./OfficerChat";

import TrollFamily from "./TrollFamily";

import PublicProfile from "./PublicProfile";

import Followers from "./Followers";

import PaymentRequired from "./PaymentRequired";

import SupabaseExample from "./SupabaseExample";
import ManualCoinsPayment from "./ManualCoinsPayment";

import LoginPage from "./LoginPage";
import React, { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUserProfile } from "@/api/supabaseHelpers";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from "@/api/supabaseClient";

const PAGES = {
    
    Home: Home,
    
    Store: Store,
    
    StreamViewer: StreamViewer,
    
    Subscriptions: Subscriptions,
    
    Rewards: Rewards,
    
    Messages: Messages,
    
    GoLive: GoLive,
    
    Earnings: Earnings,
    
    ProfileSetup: ProfileSetup,
    
    Profile: Profile,
    
    Trending: Trending,
    
    Following: Following,
    
    TrollOfficerApplication: TrollOfficerApplication,
    
    Admin: Admin,
    
    
    Notifications: Notifications,
    
    Disclaimer: Disclaimer,
    
    Safety: Safety,
    
    Privacy: Privacy,
    
    TrollFamilyApplication: TrollFamilyApplication,
    
    BroadcasterApplication: BroadcasterApplication,
    
    OfficerChat: OfficerChat,
    
    TrollFamily: TrollFamily,
    
    PublicProfile: PublicProfile,
    
    Followers: Followers,
    
    PaymentRequired: PaymentRequired,
    
    SupabaseExample: SupabaseExample,
    
    
    
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
    const { data: user, isLoading } = useQuery({
      queryKey: ["currentUser"],
      queryFn: getCurrentUserProfile,
    });
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
        try { queryClient.invalidateQueries({ queryKey: ["currentUser"] }); } catch {}
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
                
                <Route path="/Subscriptions" element={<Subscriptions />} />
                
                <Route path="/Rewards" element={<Rewards />} />
                
                <Route path="/Messages" element={<Messages />} />
                
                <Route path="/GoLive" element={<GoLive />} />
                
                <Route path="/Earnings" element={<Earnings />} />
                
                <Route path="/ProfileSetup" element={<ProfileSetup />} />
                
                <Route path="/Profile" element={<Profile />} />
                
                <Route path="/Trending" element={<Trending />} />
                
                <Route path="/Following" element={<Following />} />
                
                <Route path="/TrollOfficerApplication" element={<TrollOfficerApplication />} />
                
                <Route path="/Admin" element={<Admin />} />
                
                
                <Route path="/Notifications" element={<Notifications />} />
                
                <Route path="/Disclaimer" element={<Disclaimer />} />
                
                <Route path="/Safety" element={<Safety />} />
                
                <Route path="/Privacy" element={<Privacy />} />
                
                <Route path="/TrollFamilyApplication" element={<TrollFamilyApplication />} />
                
                <Route path="/BroadcasterApplication" element={<BroadcasterApplication />} />
                
                <Route path="/OfficerChat" element={<OfficerChat />} />
                
                <Route path="/TrollFamily" element={<TrollFamily />} />
                
                <Route path="/PublicProfile" element={<PublicProfile />} />
                
                <Route path="/Followers" element={<Followers />} />
                
                <Route path="/PaymentRequired" element={<PaymentRequired />} />
                
                <Route path="/SupabaseExample" element={<SupabaseExample />} />
                
                {/* Manual payment routes (support both cases) */}
                <Route path="/manual-coins-payment" element={<ManualCoinsPayment />} />
                <Route path="/ManualCoinsPayment" element={<ManualCoinsPayment />} />
                
                
                
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
