import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ClientApp from './pages/ClientApp';
import TrainerDashboard from './pages/TrainerDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ClientApp />} />
          <Route path="/trainer" element={<TrainerDashboard />} />
          <Route path="/trainer/client/:clientId" element={<TrainerDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
