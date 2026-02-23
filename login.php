<?php
session_start();
require_once __DIR__ . '/api/auth.php';

// If already logged in, redirect to dashboard
if (isLoggedIn()) {
    header('Location: index.php');
    exit;
}

// Handle login error messages
$error = isset($_GET['error']) ? $_GET['error'] : '';
$success = isset($_GET['success']) ? $_GET['success'] : '';
$resetLinkSent = !empty($_GET['reset_link_sent']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In - SATC Repair Ticketing System</title>
    <link rel="icon" type="image/png" href="logo.png">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Poppins', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background-image: url('bg-overlayed.png');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            position: relative;
        }

        /* Logo in upper left */
        .logo-top-left {
            position: fixed;
            top: 24px;
            left: 24px;
            z-index: 1000;
        }

        .logo-top-left img {
            height: 40px;
            width: auto;
            filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
        }

        /* Login card container */
        .login-container {
            width: 100%;
            max-width: 440px;
            padding: 20px;
        }

        .login-card {
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12);
            padding: 48px 40px;
            animation: fadeInUp 0.5s ease;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Header */
        .login-header {
            text-align: center;
            margin-bottom: 36px;
        }

        .login-header-logo {
            margin-bottom: 16px;
        }

        .login-header-logo img {
            height: 72px;
            width: auto;
            object-fit: contain;
        }

        .login-title {
            font-size: 28px;
            font-weight: 500;
            color: #1F2937;
            margin-bottom: 0;
        }

        /* Form elements */
        .form-group {
            margin-bottom: 18px;
        }

        .form-label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 6px;
        }

        .form-input {
            width: 100%;
            padding: 10px 12px;
            font-size: 14px;
            font-family: 'Poppins', sans-serif;
            font-weight: 400;
            color: #1F2937;
            background: #FDF2F7;
            border: 1.5px solid #ff4081;
            border-radius: 8px;
            transition: all 0.3s ease;
            outline: none;
        }

        .form-input:focus {
            background: #ffffff;
            border-color: #e91e63;
            box-shadow: 0 0 0 4px rgba(255, 64, 129, 0.25);
        }

        .form-input::placeholder {
            color: #9CA3AF;
        }

        /* Password field with reveal button */
        .password-wrap {
            position: relative;
        }
        .password-wrap .form-input {
            padding-right: 40px;
        }
        .password-toggle {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            padding: 4px;
            cursor: pointer;
            color: #6B7280;
            font-size: 18px;
            line-height: 1;
            transition: color 0.2s ease;
        }
        .password-toggle:hover {
            color: #ff4081;
        }
        .password-toggle:focus {
            outline: none;
        }

        /* Submit button - pink */
        .btn-submit {
            width: 100%;
            padding: 14px;
            font-size: 16px;
            font-weight: 600;
            font-family: 'Poppins', sans-serif;
            color: #ffffff;
            background: linear-gradient(135deg, #ff4081 0%, #e91e63 100%);
            border: none;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(255, 64, 129, 0.3);
            margin-top: 8px;
        }

        .btn-submit:hover {
            background: linear-gradient(135deg, #e91e63 0%, #c2185b 100%);
            box-shadow: 0 6px 20px rgba(255, 64, 129, 0.4);
            transform: translateY(-2px);
        }

        .btn-submit:active {
            transform: translateY(0);
        }

        /* Forgot password link */
        .forgot-password {
            text-align: center;
            margin-top: 20px;
        }

        .forgot-password a {
            font-size: 14px;
            font-weight: 500;
            color: #3B82F6;
            text-decoration: none;
            transition: color 0.3s ease;
        }

        .forgot-password a:hover {
            color: #2563EB;
            text-decoration: underline;
        }

        /* Alert messages */
        .alert {
            padding: 14px 16px;
            border-radius: 10px;
            margin-bottom: 24px;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .alert-error {
            background: #FEE2E2;
            color: #991B1B;
            border: 1.5px solid #FCA5A5;
        }

        .alert-success {
            background: #D1FAE5;
            color: #065F46;
            border: 1.5px solid #6EE7B7;
        }

        .alert-icon {
            font-size: 18px;
            flex-shrink: 0;
        }

        /* Loading state */
        .btn-submit:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .btn-submit.loading::after {
            content: '';
            width: 16px;
            height: 16px;
            margin-left: 10px;
            border: 2px solid #ffffff;
            border-top-color: transparent;
            border-radius: 50%;
            display: inline-block;
            animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* Responsive */
        @media (max-width: 480px) {
            .logo-top-left {
                top: 16px;
                left: 16px;
            }

            .logo-top-left img {
                height: 36px;
            }

            .login-card {
                padding: 36px 28px;
            }

            .login-header-logo img {
                height: 60px;
            }

            .login-title {
                font-size: 24px;
            }

            .form-input {
                padding: 9px 11px;
                font-size: 13px;
            }

            .btn-submit {
                padding: 12px;
                font-size: 15px;
            }
        }

        /* Password changed confirmation – bottom overlay (site design: solid colors, Poppins) */
        .password-changed-modal {
            display: none;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            padding: 1rem 1.5rem;
            font-family: 'Poppins', sans-serif;
        }
        .password-changed-modal.visible {
            display: block;
        }
        .password-changed-modal .modal-card {
            background: #ffffff;
            border-radius: 10px 10px 0 0;
            border-top: 3px solid #ff4081;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
            padding: 12px 18px;
            max-width: 380px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .password-changed-modal .modal-icon {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            background: #059669;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 18px;
            font-weight: 600;
        }
        .password-changed-modal .modal-body {
            flex: 1;
            min-width: 0;
        }
        .password-changed-modal .modal-title {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 2px;
            font-family: 'Poppins', sans-serif;
        }
        .password-changed-modal .modal-text {
            font-size: 12px;
            color: #555;
            line-height: 1.4;
            font-family: 'Poppins', sans-serif;
        }

        /* Reset link sent – bottom overlay (site design: solid colors, Poppins) */
        .reset-link-sent-modal {
            display: none;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            padding: 1rem 1.5rem;
            font-family: 'Poppins', sans-serif;
        }
        .reset-link-sent-modal.visible {
            display: block;
        }
        .reset-link-sent-modal .modal-card {
            background: #ffffff;
            border-radius: 10px 10px 0 0;
            border-top: 3px solid #ff4081;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
            padding: 12px 18px;
            max-width: 380px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .reset-link-sent-modal .modal-icon {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            background: #059669;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 18px;
            font-weight: 600;
        }
        .reset-link-sent-modal .modal-body {
            flex: 1;
            min-width: 0;
        }
        .reset-link-sent-modal .modal-title {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 2px;
            font-family: 'Poppins', sans-serif;
        }
        .reset-link-sent-modal .modal-text {
            font-size: 12px;
            color: #555;
            line-height: 1.4;
            font-family: 'Poppins', sans-serif;
        }
    </style>
</head>
<body>
    <?php if ($resetLinkSent): ?>
    <div class="reset-link-sent-modal visible" id="resetLinkSentModal" role="dialog" aria-labelledby="resetLinkSentModalTitle" aria-modal="true">
        <div class="modal-card">
            <div class="modal-icon" aria-hidden="true">✓</div>
            <div class="modal-body">
                <h2 class="modal-title" id="resetLinkSentModalTitle">Check your email</h2>
                <p class="modal-text">If an account exists for that email, you will receive a reset link shortly. Please check your inbox.</p>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <?php if ($success === 'password_reset'): ?>
    <div class="password-changed-modal visible" id="passwordChangedModal" role="dialog" aria-labelledby="passwordChangedModalTitle" aria-modal="true">
        <div class="modal-card">
            <div class="modal-icon" aria-hidden="true">✓</div>
            <div class="modal-body">
                <h2 class="modal-title" id="passwordChangedModalTitle">Password changed</h2>
                <p class="modal-text">Your password has been changed successfully. You can now sign in with your new password.</p>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- Logo in top left -->
    <div class="logo-top-left">
        <img src="logo.png" alt="SATC Logo">
    </div>

    <!-- Login container -->
    <div class="login-container">
        <div class="login-card">
            <!-- Header -->
            <div class="login-header">
                <div class="login-header-logo">
                    <img src="s2s.png" alt="SATC">
                </div>
                <h1 class="login-title">Welcome Back!</h1>
            </div>

            <!-- Error/Success messages -->
            <?php if ($error): ?>
                <div class="alert alert-error">
                    <span class="alert-icon">⚠</span>
                    <span>
                        <?php
                        switch ($error) {
                            case 'invalid':
                                echo 'Invalid email or password';
                                break;
                            case 'empty':
                                echo 'Please enter your email and password';
                                break;
                            case 'session':
                                echo 'Your session has expired. Please sign in again.';
                                break;
                            default:
                                echo 'An error occurred. Please try again.';
                        }
                        ?>
                    </span>
                </div>
            <?php endif; ?>

            <!-- Login form -->
            <form method="POST" action="api/auth.php" id="loginForm">
                <input type="hidden" name="action" value="login">

                <div class="form-group">
                    <label for="email" class="form-label">Email</label>
                    <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        class="form-input" 
                        placeholder="Enter your email"
                        required
                        autocomplete="email"
                        autofocus
                    >
                </div>

                <div class="form-group">
                    <label for="password" class="form-label">Password</label>
                    <div class="password-wrap">
                        <input 
                            type="password" 
                            id="password" 
                            name="password" 
                            class="form-input" 
                            placeholder="Enter your password"
                            required
                            autocomplete="current-password"
                        >
                        <button type="button" class="password-toggle" id="passwordToggle" aria-label="Show password" title="Show password">
                            <i class="fas fa-eye" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>

                <button type="submit" class="btn-submit" id="submitBtn">
                    Login
                </button>
            </form>

            <!-- Forgot password link -->
            <div class="forgot-password">
                <a href="forgot_password.php">Forgot password?</a>
            </div>
        </div>
    </div>

    <script>
        // Password reveal toggle
        (function() {
            var toggle = document.getElementById('passwordToggle');
            var input = document.getElementById('password');
            if (toggle && input) {
                toggle.addEventListener('click', function() {
                    var icon = toggle.querySelector('i');
                    if (input.type === 'password') {
                        input.type = 'text';
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                        toggle.setAttribute('aria-label', 'Hide password');
                        toggle.setAttribute('title', 'Hide password');
                    } else {
                        input.type = 'password';
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                        toggle.setAttribute('aria-label', 'Show password');
                        toggle.setAttribute('title', 'Show password');
                    }
                });
            }
        })();

        // Password changed popup: auto-hide after 3 seconds and clean URL
        (function() {
            var modal = document.getElementById('passwordChangedModal');
            if (modal) {
                setTimeout(function() {
                    modal.classList.remove('visible');
                    if (window.history && window.history.replaceState) {
                        var url = new URL(window.location.href);
                        url.searchParams.delete('success');
                        window.history.replaceState({}, '', url.toString());
                    }
                }, 3000);
            }
        })();

        // Reset link sent popup: auto-hide after 3 seconds and clean URL
        (function() {
            var modal = document.getElementById('resetLinkSentModal');
            if (modal) {
                setTimeout(function() {
                    modal.classList.remove('visible');
                    if (window.history && window.history.replaceState) {
                        var url = new URL(window.location.href);
                        url.searchParams.delete('reset_link_sent');
                        window.history.replaceState({}, '', url.toString());
                    }
                }, 3000);
            }
        })();

        // Add loading state to button on submit
        document.getElementById('loginForm').addEventListener('submit', function(e) {
            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            btn.classList.add('loading');
            btn.textContent = 'Signing in';
        });

        // Clear error/success messages after 5 seconds
        setTimeout(function() {
            const alerts = document.querySelectorAll('.alert');
            alerts.forEach(function(alert) {
                alert.style.animation = 'fadeOut 0.3s ease';
                setTimeout(function() {
                    alert.remove();
                }, 300);
            });
        }, 5000);
    </script>
</body>
</html>