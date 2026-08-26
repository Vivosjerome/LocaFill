import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { HomePage } from '@/pages/HomePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { AnalyzerPage } from '@/pages/AnalyzerPage'
import { PreviewPage } from '@/pages/PreviewPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="analyzer" element={<AnalyzerPage />} />
          <Route path="preview" element={<PreviewPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
