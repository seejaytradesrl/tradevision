/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Dashboard from './components/Dashboard';
import { AuthProvider } from './components/AuthProvider';

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#0a0a0b] text-zinc-100 selection:bg-emerald-500/30">
        <Dashboard />
      </div>
    </AuthProvider>
  );
}
