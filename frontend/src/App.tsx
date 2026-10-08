import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './app/AppShell';
import { RequireAuth, RequirePermission } from '@/auth/guards';

import LoginPage from './pages/Login/LoginPage';
import ChangePasswordPage from './pages/Login/ChangePasswordPage';
import HomePage from './pages/HomePage';
import AircraftListPage from './pages/AircraftListPage';
import AircraftFlightsPage from './pages/AircraftFlightsPage';
import FlightOverviewPage from './pages/FlightOverviewPage';
import FlightParametersPage from './pages/FlightParametersPage';
import EventInspectorPage from './pages/EventInspectorPage';
import PlotPage from './pages/PlotPage';
import IngestionPage from './pages/IngestionPage';
import QueuePage from './pages/QueuePage';
import StatisticsPage from './pages/StatisticsPage';
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

        <Route path="flights" element={<AircraftListPage />} />
        <Route path="flights/:tail" element={<AircraftFlightsPage />} />
        <Route path="flights/:tail/:flightNo" element={<FlightOverviewPage />} />
        <Route path="flights/:tail/:flightNo/parameters" element={<FlightParametersPage />} />
        <Route path="flights/:tail/:flightNo/events" element={<EventInspectorPage />} />
        <Route path="flights/:tail/:flightNo/plots" element={<Navigate to="retraction" replace />} />
        <Route path="flights/:tail/:flightNo/plots/:set" element={<PlotPage />} />

        <Route path="ingestion" element={<IngestionPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="statistics" element={<StatisticsPage />} />
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