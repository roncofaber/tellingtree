import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* Tree — tabbed main view */}
              <Route path="/trees/:treeId" element={<TreeDetailPage />} />

              {/* Tree settings / management */}
              <Route path="/trees/:treeId/manage" element={<TreeManagePage />} />

              {/* Detail pages */}
              <Route path="/trees/:treeId/persons/:personId" element={<PersonDetailPage />} />
              <Route path="/trees/:treeId/stories/:storyId"  element={<StoryDetailPage />} />

              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
