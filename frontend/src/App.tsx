import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { RequireAuth, RequirePermission } from '@/auth/guards';

import LoginPage from './pages/Login/LoginPage';
import ChangePasswordPage from './pages/Login/ChangePasswordPage';
import HomePage from './pages/HomePage';
import IngestionPage from './pages/IngestionPage';
import DashboardPage from './pages/DashboardPage';
import ConfigurationPage from './pages/ConfigurationPage';
import UsersPage from './pages/UsersPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />

      <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<HomePage />} />

        <Route path="ingestion" element={<IngestionPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="statistics" element={<Navigate to="/dashboard" replace />} />
        <Route path="flights/*" element={<Navigate to="/dashboard" replace />} />
        <Route path="queue" element={<Navigate to="/ingestion" replace />} />
        <Route path="configuration" element={<ConfigurationPage />} />
        <Route
          path="users"
          element={
            <RequirePermission permission="manage_users">
              <UsersPage />
            </RequirePermission>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}