import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { TreeDetailPage } from "@/pages/tree/TreeDetailPage";
import { TreeManagePage } from "@/pages/tree/TreeManagePage";
import { PersonDetailPage } from "@/pages/tree/PersonDetailPage";
import { StoryDetailPage } from "@/pages/tree/StoryDetailPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { AdminPage } from "@/pages/AdminPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { InvitePage } from "@/pages/InvitePage";
import { NotificationsPage } from "@/pages/NotificationsPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login"               element={<LoginPage />} />
            <Route path="/register"            element={<RegisterPage />} />
            <Route path="/register/:token"     element={<RegisterPage />} />
            <Route path="/forgot-password"     element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* Tree — tabbed main view */}
              <Route path="/trees/:treeSlug" element={<TreeDetailPage />} />
              <Route path="/trees/:treeSlug/graph" element={<TreeDetailPage />} />
              <Route path="/trees/:treeSlug/map" element={<TreeDetailPage />} />
              <Route path="/trees/:treeSlug/people" element={<TreeDetailPage />} />
              <Route path="/trees/:treeSlug/stories" element={<TreeDetailPage />} />
              <Route path="/trees/:treeSlug/media" element={<TreeDetailPage />} />

              {/* Tree settings / management */}
              <Route path="/trees/:treeSlug/manage" element={<TreeManagePage />} />

              {/* Detail pages */}
              <Route path="/trees/:treeSlug/people/:personId" element={<PersonDetailPage />} />
              <Route path="/trees/:treeSlug/stories/:storyId"  element={<StoryDetailPage />} />

              <Route path="/settings"       element={<SettingsPage />} />
              <Route path="/admin"          element={<AdminPage />} />
              <Route path="/notifications"  element={<NotificationsPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
            </Route>

            <Route path="*" element={
              <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
                <p className="text-6xl font-bold text-muted-foreground">404</p>
                <p className="text-lg text-muted-foreground">Page not found</p>
                <a href="/dashboard" className="text-primary hover:underline text-sm">Go to Dashboard</a>
              </div>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
