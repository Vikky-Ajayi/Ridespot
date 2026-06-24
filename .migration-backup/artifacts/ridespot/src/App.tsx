import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProviders } from "@/components/layout/AppProviders";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/600-italic.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "react-phone-input-2/lib/style.css";

import LandingPage from "@/app/page";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import EnterOtpPage from "@/app/enter-otp/page";
import VerifyEmailPage from "@/app/verify-email/page";
import SetNewPasswordPage from "@/app/set-new-password/page";
import ContactPage from "@/app/contact/page";
import PrivacyPolicyPage from "@/app/privacy-policy/page";
import TermsOfServicePage from "@/app/terms-of-service/page";

import AppLayout from "@/app/app/layout";
import HomePage from "@/app/app/home/page";
import HotspotsPage from "@/app/app/hotspots/page";
import ProfilePage from "@/app/app/profile/page";
import EditProfilePage from "@/app/app/profile/edit/page";
import PasswordPage from "@/app/app/profile/password/page";

import AdminLoginPage from "@/app/admin/login/page";
import AdminIndexPage from "@/app/admin/page";
import AdminHotspotsPage from "@/app/admin/hotspots/page";
import AdminDriversPage from "@/app/admin/drivers/page";
import AdminEventsPage from "@/app/admin/events/page";
import AdminNotificationsPage from "@/app/admin/notifications/page";
import AdminMlPage from "@/app/admin/ml/page";
import AdminMarketsPage from "@/app/admin/config/markets/page";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/enter-otp" component={EnterOtpPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/set-new-password" component={SetNewPasswordPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/terms-of-service" component={TermsOfServicePage} />

      <Route path="/app">
        {() => (
          <AppLayout>
            <HomePage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/home">
        {() => (
          <AppLayout>
            <HomePage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/hotspots">
        {() => (
          <AppLayout>
            <HotspotsPage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/profile">
        {() => (
          <AppLayout>
            <ProfilePage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/profile/edit">
        {() => (
          <AppLayout>
            <EditProfilePage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/profile/password">
        {() => (
          <AppLayout>
            <PasswordPage />
          </AppLayout>
        )}
      </Route>

      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin">
        {() => <AdminIndexPage />}
      </Route>
      <Route path="/admin/hotspots" component={AdminHotspotsPage} />
      <Route path="/admin/drivers" component={AdminDriversPage} />
      <Route path="/admin/events" component={AdminEventsPage} />
      <Route path="/admin/notifications" component={AdminNotificationsPage} />
      <Route path="/admin/ml" component={AdminMlPage} />
      <Route path="/admin/config/markets" component={AdminMarketsPage} />

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProviders>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </AppProviders>
    </QueryClientProvider>
  );
}

export default App;
