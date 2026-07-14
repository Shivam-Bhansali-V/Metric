import { useState, useEffect, useRef } from 'react';

interface LoginProps {
  onLoginSuccess: (user: { id: string; email: string; username: string }) => void;
  apiCall: (endpoint: string, method: string, body?: any) => Promise<any>;
}

export default function Login({ onLoginSuccess, apiCall }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Registration States
  const [regRequired, setRegRequired] = useState(false);
  const [regSub, setRegSub] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [username, setUsername] = useState('');
  
  // Username validation states
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'empty' | 'too-short' | 'available' | 'taken'>('empty');
  
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const checkTimeoutRef = useRef<any>(null);

  // Initialize Google Identity Services (GSI)
  useEffect(() => {
    // Callback helper when Google OAuth succeeds
    (window as any).handleCredentialResponse = async (response: any) => {
      setLoading(true);
      setError('');
      try {
        const result = await apiCall('/api/auth/google-login', 'POST', { token: response.credential });
        if (result.success) {
          onLoginSuccess(result.user);
        } else if (result.registrationRequired) {
          setRegSub(result.sub);
          setRegEmail(result.email);
          setRegRequired(true);
        }
      } catch (err: any) {
        setError(err.message || 'Authentication failed. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    // Load Google script dynamically if not present
    if (!document.getElementById('google-jssdk')) {
      const script = document.createElement('script');
      script.id = 'google-jssdk';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    // Wait for the script to load and initialize button
    const initInterval = setInterval(() => {
      if ((window as any).google) {
        clearInterval(initInterval);
        (window as any).google.accounts.id.initialize({
          client_id: '416670200325-1q195mjuj2ha2rfkpvprc2do6se1ertl.apps.googleusercontent.com',
          callback: (window as any).handleCredentialResponse,
        });
        
        if (googleBtnRef.current) {
          (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular'
          });
        }
      }
    }, 200);

    return () => clearInterval(initInterval);
  }, []);

  // Debounced Username availability check
  useEffect(() => {
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    
    const clean = username.trim();
    if (!clean) {
      setUsernameStatus('empty');
      return;
    }

    if (clean.length < 3) {
      setUsernameStatus('too-short');
      return;
    }

    setCheckingUsername(true);
    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await apiCall(`/api/users/check-username?q=${encodeURIComponent(clean)}`, 'GET');
        setUsernameStatus(res.available ? 'available' : 'taken');
      } catch (err) {
        console.error(err);
      } finally {
        setCheckingUsername(false);
      }
    }, 400);

    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [username]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus !== 'available' || loading) return;

    setLoading(true);
    setError('');
    try {
      const result = await apiCall('/api/auth/register', 'POST', {
        sub: regSub,
        email: regEmail,
        username: username.trim()
      });
      if (result.success) {
        onLoginSuccess(result.user);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100 position-relative" style={{ zIndex: 1 }}>
      {/* Background Blurs */}
      <div className="glow-mesh glow-mesh-1"></div>
      <div className="glow-mesh glow-mesh-2"></div>
      <div className="glow-mesh glow-mesh-3"></div>

      <div className="card shadow-lg p-4 bg-white border border-light" style={{ width: '100%', maxWidth: '420px', borderRadius: '16px', zIndex: 10 }}>
        <div className="text-center mb-4">
          <img src="/logo.png" alt="Metric Logo" className="mb-2" style={{ width: '40px', height: '40px', borderRadius: '8px' }} />
          <h3 className="fw-bold text-dark mb-1">Metric</h3>
          <p className="text-muted small">Daily progress & task tracking simplified</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 small mb-3 border-0 rounded-3 text-center" style={{ fontSize: '0.85rem' }}>
            ⚠️ {error}
          </div>
        )}

        {!regRequired ? (
          /* standard login page */
          <div className="text-center py-3">
            <h5 className="fw-semibold text-muted mb-4" style={{ fontSize: '0.95rem' }}>Sign In to Your Workspace</h5>
            
            <div className="d-flex justify-content-center mb-3">
              <div ref={googleBtnRef}></div>
            </div>

            {loading && (
              <div className="mt-3 text-muted small">
                <div className="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                Verifying Google account...
              </div>
            )}
          </div>
        ) : (
          /* register page to select a unique username */
          <form onSubmit={handleRegister} className="d-flex flex-column gap-3">
            <div className="text-start">
              <h5 className="fw-bold text-dark mb-1" style={{ fontSize: '1.05rem' }}>Choose Your Username</h5>
              <p className="text-muted small mb-0">Create a unique handle for your metric logs.</p>
            </div>

            <div className="position-relative">
              <label className="form-label text-muted fw-semibold small">Username</label>
              <input 
                type="text" 
                className={`form-control ${
                  usernameStatus === 'available' ? 'is-valid' : 
                  usernameStatus === 'taken' || usernameStatus === 'too-short' ? 'is-invalid' : ''
                }`}
                placeholder="e.g. shivam10"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} // alphanumeric only
                required
                disabled={loading}
              />
              
              {/* Instant check status indicator */}
              <div className="mt-1 small">
                {checkingUsername && <span className="text-muted">Checking availability...</span>}
                {!checkingUsername && usernameStatus === 'available' && (
                  <span className="text-success fw-bold">✓ Username is available!</span>
                )}
                {!checkingUsername && usernameStatus === 'taken' && (
                  <span className="text-danger fw-bold">✕ Username is already taken.</span>
                )}
                {!checkingUsername && usernameStatus === 'too-short' && (
                  <span className="text-muted">Username must be at least 3 characters.</span>
                )}
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-100 mt-2 py-2 fw-semibold"
              disabled={usernameStatus !== 'available' || loading}
            >
              {loading ? 'Finalizing Profile...' : 'Complete Signup'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
