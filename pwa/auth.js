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

        // Trigger initial sync if needed
        if (window.syncClient) {
            window.syncClient.sync();
        }
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

        // Try sign in
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            // If sign in fails, try sign up (for MVP simplicity)
            // In production, you'd separate these or handle errors better
            console.log("Sign in failed, trying sign up...", error);
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password
            });

            if (signUpError) {
                errorDiv.textContent = "Error: " + signUpError.message;
            } else {
                errorDiv.textContent = "Account created! Please check your email to confirm, or if auto-confirm is on, you are signed in.";
                // If auto-confirm is on, the auth state change will close the modal
                setTimeout(() => loginModal.style.display = 'none', 2000);
            }
        } else {
            loginModal.style.display = 'none';
            // Auth state change listener will handle UI update
        }
    });
});
