// Auth Module for Veritas MVP
// Handles Supabase authentication

let supabase = null;
let currentUser = null;

function initAuth() {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
        console.warn("Supabase credentials not found in config.js");
        document.getElementById('userInfo').textContent = "Cloud Sync Disabled (No Config)";
        return;
    }

    try {
        supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            updateAuthUI(session?.user);
        });

        // Listen for auth changes
        supabase.auth.onAuthStateChange((_event, session) => {
            updateAuthUI(session?.user);
        });

    } catch (e) {
        console.error("Failed to initialize Supabase:", e);
    }
}

function updateAuthUI(user) {
    currentUser = user;
    const userInfo = document.getElementById('userInfo');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const syncControls = document.getElementById('syncControls');

    if (user) {
        userInfo.textContent = `Signed in as: ${user.email}`;
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        syncControls.style.display = 'flex';

        // Trigger initial sync if needed (with delay to ensure UI is ready)
        setTimeout(() => {
            if (window.syncClient && currentUser) {  // Double-check user is still logged in
                window.syncClient.sync();
            }
        }, 100);
    } else {
        userInfo.textContent = "Not signed in";
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        syncControls.style.display = 'none';
    }
}

// UI Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    // Login Modal
    const loginModal = document.getElementById('loginModal');
    const loginBtn = document.getElementById('loginBtn');
    const cancelLoginBtn = document.getElementById('cancelLoginBtn');
    const doLoginBtn = document.getElementById('doLoginBtn');
    const doRegisterBtn = document.getElementById('doRegisterBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    loginBtn.addEventListener('click', () => {
        loginModal.style.display = 'flex';
    });

    cancelLoginBtn.addEventListener('click', () => {
        loginModal.style.display = 'none';
        document.getElementById('loginError').textContent = '';
    });

    logoutBtn.addEventListener('click', async () => {
        if (supabase) {
            await supabase.auth.signOut();
        }
    });

    doLoginBtn.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('loginError');

        if (!email || !password) {
            errorDiv.textContent = "Please enter email and password";
            return;
        }

        errorDiv.textContent = "Signing in...";

        if (!supabase) {
            errorDiv.textContent = "Supabase not initialized.";
            return;
        }

        // Try sign in first
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            // Check if it's "Invalid login credentials" - don't try to sign up
            if (error.message.includes("Invalid login credentials")) {
                errorDiv.textContent = "Invalid email or password. Please try again or create a new account.";
                return;
            }

            // For other errors (like "User not confirmed"), show the specific error
            errorDiv.textContent = "Login failed: " + error.message;
            console.error("Login error:", error);
            return;
        }

        // Success - close modal
        loginModal.style.display = 'none';
        // Auth state change listener will handle UI update
    });

    doRegisterBtn.addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('loginError');

        if (!email || !password) {
            errorDiv.textContent = "Please enter email and password";
            return;
        }

        if (!supabase) {
            errorDiv.textContent = "Supabase not initialized.";
            return;
        }

        errorDiv.textContent = "Creating account...";

        // Try sign up
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) {
            errorDiv.textContent = "Error creating account: " + error.message;
        } else {
            errorDiv.textContent = "Account created! Please check your email to confirm.";
            // If auto-confirm is on, the auth state change will close the modal
            setTimeout(() => {
                if (!document.getElementById('loginError').textContent.includes("check your email")) {
                    loginModal.style.display = 'none';
                }
            }, 2000);
        }
    });
});
