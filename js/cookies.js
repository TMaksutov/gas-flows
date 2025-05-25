// Cookie consent management
class CookieConsent {
  constructor() {
    this.consentKey = 'gas-flows-cookie-consent';
    this.analyticsKey = 'gas-flows-analytics-consent';
    this.init();
  }

  init() {
    // Check if user has already made a choice
    const consent = localStorage.getItem(this.consentKey);
    if (!consent) {
      this.showCookieNotice();
    } else if (consent === 'accepted') {
      this.enableAnalytics();
    }
    
    // Add cookie settings link to footer (if not on contacts page) - REMOVED
    // this.addCookieSettingsLink();
  }

  // REMOVED: addCookieSettingsLink method no longer adds links to footers
  // addCookieSettingsLink() {
  //   // Add a small cookie settings link to the footer (except on contacts page)
  //   const footer = document.querySelector('footer');
  //   const isContactsPage = window.location.pathname.includes('contacts.html');
  //   
  //   if (footer && !document.getElementById('cookie-settings-link') && !isContactsPage) {
  //     const cookieLink = document.createElement('p');
  //     cookieLink.innerHTML = `<a href="#" id="cookie-settings-link" onclick="cookieConsent.showCookieSettings(); return false;" style="font-size: 0.8em; color: #666; text-decoration: underline;">Cookie Settings</a>`;
  //     footer.appendChild(cookieLink);
  //   }
  // }

  showCookieNotice() {
    // Remove any existing notice first
    this.hideCookieNotice();
    
    const notice = document.createElement('div');
    notice.className = 'cookie-notice';
    notice.innerHTML = `
      <div class="cookie-notice-content">
        <div class="cookie-notice-text">
          This website uses cookies to analyze traffic and improve your experience. 
          We use Google Analytics to understand how visitors interact with our site.
          <a href="#" onclick="cookieConsent.showDetails(); return false;">Learn more</a>
        </div>
        <div class="cookie-notice-buttons">
          <button class="cookie-btn cookie-btn-accept" onclick="cookieConsent.acceptCookies()">
            Accept All
          </button>
          <button class="cookie-btn cookie-btn-decline" onclick="cookieConsent.declineCookies()">
            Decline
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(notice);
  }

  showCookieSettings() {
    // Reset consent and show notice again
    localStorage.removeItem(this.consentKey);
    localStorage.removeItem(this.analyticsKey);
    this.clearGoogleAnalyticsCookies();
    this.showCookieNotice();
  }

  acceptCookies() {
    localStorage.setItem(this.consentKey, 'accepted');
    localStorage.setItem(this.analyticsKey, 'true');
    this.enableAnalytics();
    this.hideCookieNotice();
    this.showConfirmation('Cookies accepted! Analytics tracking is now enabled.');
  }

  declineCookies() {
    localStorage.setItem(this.consentKey, 'declined');
    localStorage.setItem(this.analyticsKey, 'false');
    this.disableAnalytics();
    this.hideCookieNotice();
    this.showConfirmation('Cookies declined. Only essential cookies will be used.');
  }

  showConfirmation(message) {
    // Show a brief confirmation message
    const confirmation = document.createElement('div');
    confirmation.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #27ae60;
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    confirmation.textContent = message;
    document.body.appendChild(confirmation);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (confirmation.parentNode) {
        confirmation.parentNode.removeChild(confirmation);
      }
    }, 3000);
  }

  hideCookieNotice() {
    const notice = document.querySelector('.cookie-notice');
    if (notice) {
      notice.remove();
    }
  }

  enableAnalytics() {
    // Enable Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('consent', 'update', {
        'analytics_storage': 'granted'
      });
    }
  }

  disableAnalytics() {
    // Disable Google Analytics
    if (typeof gtag !== 'undefined') {
      gtag('consent', 'update', {
        'analytics_storage': 'denied'
      });
    }
    // Clear existing GA cookies
    this.clearGoogleAnalyticsCookies();
  }

  clearGoogleAnalyticsCookies() {
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      if (name.startsWith('_ga') || name.startsWith('_gid')) {
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }
    }
  }

  showDetails() {
    alert(`Cookie Details:

Essential Cookies: Required for basic website functionality
   - Session management
   - User preferences (form data, settings)
   - Security features

Analytics Cookies: Google Analytics (optional)
   - Page views and user interactions
   - Website performance metrics
   - Helps us improve the website

How to change preferences:
   - Use the "Cookie Settings" section on the contacts page
   - Clear your browser data and revisit the site
   - Contact us if you need assistance

Your privacy is important to us. We only use analytics to improve the website experience.`);
  }

  // Method to check if analytics is consented
  isAnalyticsConsented() {
    return localStorage.getItem(this.analyticsKey) === 'true';
  }

  // Method to manually reset cookies (for testing)
  resetCookieSettings() {
    localStorage.removeItem(this.consentKey);
    localStorage.removeItem(this.analyticsKey);
    this.clearGoogleAnalyticsCookies();
    this.showCookieNotice();
  }
}

// Initialize cookie consent when DOM is loaded
let cookieConsent;
document.addEventListener('DOMContentLoaded', function() {
  cookieConsent = new CookieConsent();
}); 