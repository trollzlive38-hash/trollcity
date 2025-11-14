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
import ManualPaymentCenter from "./ManualPaymentCenter";
import Notifications from "./Notifications";
import NotificationsPage from "./NotificationsPage";
import AdminDashboardPage from "./AdminDashboardPage.jsx";
import LoginPage from "./LoginPage";
import Auth from "./Auth.jsx";
import Messages from "./Messages.jsx";
import Employment from "./Employment.jsx";
import ContactUs from "./ContactUs.jsx";
import TrollOfficerApplication from "./TrollOfficerApplication.jsx";
import TrollerApplication from "./TrollerApplication.jsx";
import AdminTrollers from "./AdminTrollers.jsx";
import AdminInvite from "./AdminInvite.jsx";
import Earnings from "./Earnings.jsx";
import TrollFamilyApplication from "./TrollFamilyApplication.jsx";
import TrollOfficerPanel from "./TrollOfficerPanel.jsx";
import FamilyPayoutsAdmin from "./FamilyPayoutsAdmin.jsx";
import GamblePage from "./GamblePage.jsx";
import LiveStreamsAdmin from "./LiveStreamsAdmin.jsx";
import TOCommand from "./TOCommand.jsx";
import AdminAIPanel from "./AdminAIPanel.jsx";
import React, { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from "@/api/supabaseClient";

  const PAGES = {
    Home: Home,
    Store: Store,
    StreamViewer: StreamViewer,
    GoLive: GoLive,
    ProfileSetup: ProfileSetup,
    Profile: Profile,
    Earnings: Earnings,
    Trending: Trending,
    Following: Following,
    BroadcasterApplication: BroadcasterApplication,
    PublicProfile: PublicProfile,
    ManualCoinsPayment: ManualCoinsPayment,
    ManualPaymentCenter: ManualPaymentCenter,
    Notifications: Notifications,
    NotificationsPage: NotificationsPage,
    Admin: AdminDashboardPage,
    Messages: Messages,
    TrollOfficerApplication: TrollOfficerApplication,
    TrollerApplication: TrollerApplication,
    TrollFamilyApplication: TrollFamilyApplication,
    TrollOfficers: TrollOfficerPanel,
    FamilyPayouts: FamilyPayoutsAdmin,
    Gamble: GamblePage,
    Trollers: AdminTrollers,
    AdminInvite: AdminInvite,
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
    const navigate = useNavigate();
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
    
    // Force authentication as first screen - redirect all unauthenticated users to login
    const isSupabaseConfigured = !!supabase.__isConfigured;
    useEffect(() => {
      if (!authLoading && !authUser) {
        const allowedPaths = ['/login', '/auth', '/Login', '/Auth'];
        const currentPath = location.pathname.toLowerCase();
        const isAllowedPath = allowedPaths.some(path => currentPath === path.toLowerCase());
        if (!isAllowedPath) {
          navigate('/login', { replace: true });
        }
      }
    }, [authLoading, authUser, location.pathname, navigate]);
    if (!authLoading && !authUser) {
      const allowedPaths = ['/login', '/auth', '/Login', '/Auth'];
      const currentPath = location.pathname.toLowerCase();
      const isAllowedPath = allowedPaths.some(path => currentPath === path.toLowerCase());
      if (!isAllowedPath) {
        return <LoginPage />;
      }
    }

    return (
        <Layout currentPageName={currentPage}>
            <Routes>
                <Route path="/Login" element={<LoginPage />} />
                <Route path="/login" element={<LoginPage />} />            
                <Route path="/Auth" element={<LoginPage />} />
                <Route path="/" element={<Home />} />
                <Route path="/Home" element={<Home />} />
                <Route path="/Store" element={<Store />} />
                <Route path="/StreamViewer" element={<StreamViewer />} />
                <Route path="/GoLive" element={<GoLive />} />
                <Route path="/ProfileSetup" element={<ProfileSetup />} />
                <Route path="/Profile" element={<Profile />} />
                <Route path="/Trending" element={<Trending />} />
                <Route path="/Following" element={<Following />} />
                <Route path="/Messages" element={<Messages />} />
                <Route path="/BroadcasterApplication" element={<BroadcasterApplication />} />
                <Route path="/PublicProfile" element={<PublicProfile />} />
                <Route path="/manual-coins-payment" element={<ManualCoinsPayment />} />
                <Route path="/ManualCoinsPayment" element={<ManualCoinsPayment />} />
                <Route path="/ManualPaymentCenter" element={<ManualPaymentCenter />} />
                <Route path="/manual-payment-center" element={<ManualPaymentCenter />} />
                <Route path="/Notifications" element={<Notifications />} />
                <Route path="/NotificationsPage" element={<NotificationsPage />} />
                <Route path="/Admin" element={<AdminDashboardPage />} />
                <Route path="/Employment" element={<Employment />} />
                <Route path="/ContactUs" element={<ContactUs />} />
                <Route path="/TrollOfficerApplication" element={<TrollOfficerApplication />} />
                <Route path="/TrollerApplication" element={<TrollerApplication />} />
                <Route path="/TrollFamilyApplication" element={<TrollFamilyApplication />} />
                <Route path="/TrollOfficers" element={<TrollOfficerPanel />} />
                <Route path="/Trollers" element={<AdminTrollers />} />
                <Route path="/FamilyPayouts" element={<FamilyPayoutsAdmin />} />
                <Route path="/Gamble" element={<GamblePage />} />
                <Route path="/Earnings" element={<Earnings />} />
                <Route path="/TOCommand" element={<TOCommand />} />
                <Route path="/AdminAI" element={<AdminAIPanel />} />
                <Route path="/AdminLiveControl" element={<LiveStreamsAdmin />} />
                <Route path="/AdminInvite" element={<AdminInvite />} />
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return <PagesContent />;
}
