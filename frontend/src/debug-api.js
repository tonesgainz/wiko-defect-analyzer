// Debug API Configuration
// Paste this in browser console to debug API issues

console.log('🔍 API Configuration Debug');
console.log('========================');
console.log('Environment Variables:');
console.log('  VITE_API_URL:', import.meta.env.VITE_API_URL);
console.log('  MODE:', import.meta.env.MODE);
console.log('  DEV:', import.meta.env.DEV);
console.log('  PROD:', import.meta.env.PROD);
console.log('');
console.log('Expected API URL:');
console.log('  https://6j6rqn6rug.execute-api.us-east-1.amazonaws.com/prod/api/v1');
console.log('');
console.log('Testing endpoints...');

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
console.log('API_BASE:', API_BASE);

// Test health
fetch(`${API_BASE.replace('/api/v1', '')}/health`)
  .then(r => r.json())
  .then(data => console.log('✅ Health:', data))
  .catch(err => console.error('❌ Health failed:', err.message));

// Test stats
fetch(`${API_BASE}/stats`)
  .then(r => r.json())
  .then(data => console.log('✅ Stats:', data))
  .catch(err => console.error('❌ Stats failed:', err.message));
