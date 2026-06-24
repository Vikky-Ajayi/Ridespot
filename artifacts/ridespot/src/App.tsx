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
import SetNewPasswordPage from "@/app/set-new-password/page";
import VerifyEmailPage from "@/app/verify-email/page";
import ContactPage from "@/app/contact/page";
import PrivacyPolicyPage from "@/app/privacy-policy/page";
import TermsOfServicePage from "@/app/terms-of-service/page";

import AppLayout from "@/app/app/layout";
import AppHomePage from "@/app/app/home/page";
import AppHotspotsPage from "@/app/app/hotspots/page";
import AppProfilePage from "@/app/app/profile/page";
import AppProfileEditPage from "@/app/app/profile/edit/page";
import AppProfilePasswordPage from "@/app/app/profile/password/page";

import AdminLayout from "@/app/admin/layout";
import AdminIndexPage from "@/app/admin/page";
import AdminLoginPage from "@/app/admin/login/page";
import AdminHotspotsPage from "@/app/admin/hotspots/page";
import AdminDriversPage from "@/app/admin/drivers/page";
import AdminEventsPage from "@/app/admin/events/page";
import AdminMarketsPage from "@/app/admin/config/markets/page";
import AdminNotificationsPage from "@/app/admin/notifications/page";
import AdminMlPage from "@/app/admin/ml/page";

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center text-center">
      <div>
        <h1 className="text-2xl font-bold text-ink">404 — Page not found</h1>
        <a href="/" className="mt-4 inline-block text-brand underline">Go home</a>
      </div>
    </div>
  );
}

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/enter-otp" component={EnterOtpPage} />
      <Route path="/set-new-password" component={SetNewPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/terms-of-service" component={TermsOfServicePage} />

      <Route path="/app">
        {() => (
          <AppLayout>
            <Redirect to="/app/home" />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/home">
        {() => (
          <AppLayout>
            <AppHomePage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/hotspots">
        {() => (
          <AppLayout>
            <AppHotspotsPage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/profile">
        {() => (
          <AppLayout>
            <AppProfilePage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/profile/edit">
        {() => (
          <AppLayout>
            <AppProfileEditPage />
          </AppLayout>
        )}
      </Route>
      <Route path="/app/profile/password">
        {() => (
          <AppLayout>
            <AppProfilePasswordPage />
          </AppLayout>
        )}
      </Route>

      <Route path="/admin">
        {() => (
          <AdminLayout>
            <AdminIndexPage />
          </AdminLayout>
        )}
      </Route>
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin/hotspots">
        {() => (
          <AdminLayout>
            <AdminHotspotsPage />
          </AdminLayout>
        )}
      </Route>
      <Route path="/admin/drivers">
        {() => (
          <AdminLayout>
            <AdminDriversPage />
          </AdminLayout>
        )}
      </Route>
      <Route path="/admin/events">
        {() => (
          <AdminLayout>
            <AdminEventsPage />
          </AdminLayout>
        )}
      </Route>
      <Route path="/admin/config/markets">
        {() => (
          <AdminLayout>
            <AdminMarketsPage />
          </AdminLayout>
        )}
      </Route>
      <Route path="/admin/notifications">
        {() => (
          <AdminLayout>
            <AdminNotificationsPage />
          </AdminLayout>
        )}
      </Route>
      <Route path="/admin/ml">
        {() => (
          <AdminLayout>
            <AdminMlPage />
          </AdminLayout>
        )}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppProviders>
          <Router />
        </AppProviders>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
