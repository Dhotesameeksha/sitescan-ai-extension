# SiteScan AI — Website Auditor Chrome Extension

SiteScan AI is a Chrome extension that audits websites for bugs, SEO, accessibility, performance, security, content issues, and client requirements.

It generates a client-ready audit report using its **built-in scanning and reporting logic**. An **optional Claude AI integration** can be enabled to generate a more polished, natural-language report from the same scan results.

## ✨ What It Checks

SiteScan AI includes **82 automated checks** across multiple categories:

### 📋 Requirements

* Paste your client's requirements
* Checks the website and selected linked pages
* Marks requirements as **Found / Partial / Missing**
* Example requirements:

  * User login and registration
  * Payment integration
  * Contact form
  * Privacy policy
  * Live chat

### 🐛 Bugs

* JavaScript errors
* Failed API requests
* Broken images
* Broken links and 404s
* Dead links
* Duplicate IDs
* Dummy links
* Horizontal scroll overflow
* Other common frontend issues

### 🔒 Security

* HTTPS check
* Mixed content
* Security headers
* CSP
* HSTS
* X-Frame-Options
* Server information leaks
* Insecure forms

### ♿ Accessibility

* Missing image alt text
* Unlabelled form fields
* Heading structure
* Approximate WCAG AA colour contrast
* Icon-only buttons without accessible labels

### 🔎 SEO

* Page title and description
* Canonical tag
* Open Graph tags
* `robots.txt`
* `sitemap.xml`
* Viewport tag
* Title and description length

### ⚡ Performance

* Page load time
* Largest Contentful Paint (LCP)
* Cumulative Layout Shift (CLS)
* Page weight
* Oversized images and scripts
* Render-blocking scripts

### 📝 Content

* Placeholder text such as "Lorem ipsum"
* "Coming soon" content
* Missing contact/privacy/terms links
* Missing clear call-to-action

Each failed check explains **why the issue matters** and **how it can be fixed**, sometimes including a code snippet.

---

## 🚀 Installation

SiteScan AI is currently installed through **Chrome Developer Mode** and is not published on the Chrome Web Store.

### 1. Clone or download the repository

```bash
git clone https://github.com/Dhotesameeksha/sitescan-ai-extension.git
```

### 2. Open Chrome Extensions

Open:

```text
chrome://extensions
```

### 3. Enable Developer Mode

Turn on **Developer mode** from the top-right corner.

### 4. Load the extension

Click **Load unpacked** and select:

```text
sitescan-extension
```

### 5. Pin the extension

Click the puzzle-piece **Extensions** icon in Chrome and pin **SiteScan AI** to the toolbar.

---

## 🧪 How to Use

1. Open the website you want to audit in Chrome.
2. Reload the page before scanning so SiteScan can capture runtime errors from the beginning of the page load.
3. Click the **SiteScan AI** extension icon.
4. Optionally enter your client's requirements, one per line.
5. Click **Scan this website**.
6. SiteScan generates an audit report in a new tab.

The report provides:

* Issues detected
* Severity/category information
* Explanation of why an issue matters
* Suggested fixes
* Code snippets where applicable

The report also provides options such as:

* **Print / Save PDF**
* **Copy AI Fix Prompt**
* **Download Report (.md / .json)**

---

## 🤖 Optional Claude AI Report

Claude is **not required for SiteScan AI to work**.

By default, SiteScan generates its report using its **built-in audit and reporting logic**. No API key is required for the built-in report.

For users who want a more natural-language AI-written report, SiteScan provides an optional Claude integration.

### Enable Claude AI reporting

1. Open the SiteScan AI popup.
2. Open **Claude AI report (optional)**.
3. Enable the checkbox.
4. Enter an Anthropic API key.
5. Run the website scan normally.
6. The generated report can include a **Claude AI report** tab.

The API key is stored locally using:

```text
chrome.storage.local
```

and is sent directly to Anthropic when the optional Claude feature is used.

If the Claude request fails, the **built-in SiteScan report remains available**, so the website scan does not depend on Claude being available.

> **Note:** API usage with Anthropic may incur costs depending on the API account and usage limits.

---

## 📊 Report Workflow

```text
Website
   ↓
SiteScan AI Chrome Extension
   ↓
Website Data Collection
   ↓
82 Automated Checks
   ↓
Built-in Audit Engine
   ↓
Audit Report
   ↓
Optional Claude AI Enhancement
   ↓
Client-Ready Report
```

---

## 🛠️ Tech Stack

* JavaScript
* HTML
* CSS
* Chrome Extension APIs
* Chrome Storage API
* Playwright for end-to-end testing
* Optional Anthropic Claude API integration

---

## 📁 Project Structure

```text
sitescan-extension/
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── popup.css
├── report.html
├── report.js
├── report.css
├── content/
│   ├── scanner.js
│   ├── inject.js
│   └── collector.js
├── lib/
│   └── report-core.js
├── icons/
└── tests/
    └── e2e.js
```

### Main Components

**`background.js`**
Handles background extension logic, link checking, security-related checks, and optional Claude communication.

**`popup.html / popup.js / popup.css`**
Provides the Chrome extension popup and scan controls.

**`report.html / report.js / report.css`**
Displays the generated website audit report.

**`content/scanner.js`**
Runs automated in-page checks covering areas such as SEO, accessibility, performance, security, bugs, and content.

**`content/inject.js`**
Captures page JavaScript errors and failed network requests.

**`content/collector.js`**
Collects information detected by the injected monitoring logic.

**`lib/report-core.js`**
Contains shared report scoring, summary generation, and AI prompt-building logic.

**`tests/e2e.js`**
Runs end-to-end testing against a deliberately broken test website.

---

## 🧪 Running the Tests

Install Playwright:

```bash
npm install playwright
```

Then run:

```bash
node tests/e2e.js
```

The test launches Chromium with the extension loaded and tests the scanning workflow against a test website containing intentionally planted issues.

The test suite also verifies the requirements matcher, report page, popup, and different categories of detected problems.

**Latest test result: 73/73 checks passed.**

---

## ⚠️ Limitations

SiteScan AI is an automated first-pass auditing tool and does not replace complete manual QA.

* It audits the currently opened page and selected same-site linked pages.
* It cannot log into authenticated areas.
* It does not complete payment transactions.
* It does not fully test server-side business logic.
* Requirement matching is primarily keyword-based.
* Features behind authentication may be reported as missing.
* Some routes may not be scanned.
* Colour contrast checking is an approximation.
* Some accessibility checks are simplified.
* Security checks do not represent a complete professional security audit.

Results should therefore be reviewed manually before being treated as a final QA or security assessment.

---

## 🔮 Future Improvements

Potential improvements include:

* Deeper authenticated-page testing
* More advanced accessibility testing
* More comprehensive security checks
* Better requirement understanding
* Automated regression testing
* Historical scan comparison
* CI/CD integration
* More AI-assisted fix explanations
* Chrome Web Store distribution

---
## 🚀 Installation

SiteScan AI is currently available as a Chrome extension through **Developer Mode**. It is not currently published on the Chrome Web Store.

### Option 1: Clone using Git

Make sure Git is installed, then open PowerShell or Terminal and run:

```bash
git clone https://github.com/Dhotesameeksha/sitescan-ai-extension.git
```

Move into the project:

```bash
cd sitescan-ai-extension
```

The Chrome extension is located inside:

```text
sitescan-extension
```

### Option 2: Download from GitHub

1. Open the SiteScan AI GitHub repository.
2. Click **Code → Download ZIP**.
3. Extract the ZIP file to a permanent location.
4. Open the extracted folder.
5. Locate the:

```text
sitescan-extension
```

folder.

### Load the Extension in Chrome

1. Open Google Chrome.
2. Enter the following in the address bar:

```text
chrome://extensions/
```

3. Turn **Developer mode** ON from the top-right corner.
4. Click **Load unpacked**.
5. Select the **`sitescan-extension`** folder.

The selected folder should directly contain:

```text
manifest.json
background.js
popup.html
popup.js
```

Do **not** select the parent `sitescan-ai-extension` folder.

6. After loading, **SiteScan AI — Website Auditor Chrome Extension** should appear in your extensions list.
7. Click the **Extensions 🧩** icon in Chrome.
8. Find **SiteScan AI** and click the **Pin 📌** icon to keep it on the toolbar.

### No npm installation required

The Chrome extension itself does **not require `npm install` or `npm run dev`** to load and use it.

The extension can be loaded directly through Chrome's **Load unpacked** option.

> **Note:** `npm install` is only required if you want to run the project's optional Playwright end-to-end tests.

---

## 👩‍💻 Project

**SiteScan AI**
A Chrome extension for automated website auditing and developer-focused issue detection.

GitHub:
https://github.com/Dhotesameeksha/sitescan-ai-extension
