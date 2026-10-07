import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/Login/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { useAuth } from './auth/AuthProvider';

/** Temporary landing page until the shell and flight register are built. */
function Placeholder() {
  const { user, signOut } = useAuth();
  return (
    <div style={{ padding: 48 }}>
      <h1>Signed in</h1>
      <p>
        {user?.display_name} — roles: {user?.roles.join(', ')}
      </p>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/flights"
        element={
          <RequireAuth>
            <Placeholder />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/flights" replace />} />
    </Routes>
  );
}
