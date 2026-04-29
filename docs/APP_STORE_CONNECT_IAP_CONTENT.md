# App Store Connect - In-App Purchase Content (English)

This document contains all the English content you need to fill in when creating In-App Purchase products in App Store Connect.

## Product Information

### Product 1: Monthly Subscription

**Product ID:** `com.river.memq.monthly`

**Reference Name:** `MemQ Monthly Subscription`

**Display Name:** `MemQ Pro Monthly`

**Description:**
```
Unlock unlimited AI conversations, PDF processing, and advanced learning features with MemQ Pro Monthly subscription. Get access to all premium features including unlimited AI assistant chats, unlimited PDF uploads, advanced learning analytics, and priority support.
```

**Subscription Duration:** `1 Month`

**Subscription Group:** `MemQ Pro` (create this group first)

**Price:** Set according to your pricing strategy

---

### Product 2: Yearly Subscription

**Product ID:** `com.river.memq.yearly`

**Reference Name:** `MemQ Yearly Subscription`

**Display Name:** `MemQ Pro Yearly`

**Description:**
```
Get the best value with MemQ Pro Yearly subscription. Enjoy all premium features including unlimited AI conversations, unlimited PDF uploads, advanced learning analytics, and priority support. Save more with our annual plan compared to monthly billing.
```

**Subscription Duration:** `1 Year`

**Subscription Group:** `MemQ Pro` (same group as monthly)

**Price:** Set according to your pricing strategy (typically 10-12 months worth of monthly price)

---

## Subscription Group Information

**Group Name:** `MemQ Pro`

**Group Display Name:** `MemQ Pro Subscription`

**Group Description:**
```
Choose the MemQ Pro subscription plan that works best for you. All plans include unlimited AI conversations, unlimited PDF uploads, advanced learning analytics, and priority support.
```

---

## App Information (if needed)

**App Name:** `MemQ: Smart Quiz & Memory`

**App Description (for App Store):**
```
MemQ is an intelligent learning companion that helps you master any subject through AI-powered quizzes and memory techniques. Transform your study materials into interactive flashcards, get instant AI assistance, and track your learning progress.

Key Features:
• AI-Powered Quiz Generation: Convert your notes, PDFs, and study materials into interactive quizzes
• Smart Memory Techniques: Use spaced repetition and active recall to improve retention
• AI Study Assistant: Get instant answers and explanations for any topic
• PDF Processing: Upload PDFs and automatically generate study materials
• Progress Tracking: Monitor your learning progress with detailed analytics
• Customizable Study Sessions: Create personalized study plans that fit your schedule

Whether you're a student preparing for exams, a professional learning new skills, or anyone looking to improve their memory, MemQ makes learning more effective and enjoyable.
```

**Keywords (for App Store Search):**
```
quiz, flashcards, study, learning, memory, education, AI, PDF, notes, exam prep, spaced repetition, active recall
```

**Support URL:** `https://your-support-url.com` (update with your actual support URL)

**Marketing URL (optional):** `https://your-marketing-url.com` (update with your actual marketing URL)

---

## Subscription Terms and Conditions

**Subscription Terms:**
```
• Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period
• Your account will be charged for renewal within 24 hours prior to the end of the current period
• You can manage and cancel your subscriptions by going to your account settings on the App Store after purchase
• Any unused portion of a free trial period will be forfeited when you purchase a subscription
```

**Privacy Policy URL:** `https://your-privacy-policy-url.com` (update with your actual privacy policy URL)

**Terms of Service URL:** `https://your-terms-url.com` (update with your actual terms URL)

---

## Localization (if needed)

If you plan to support multiple languages, you'll need to provide translations for:
- Display Name
- Description
- Subscription Group Name and Description

For now, English-only is sufficient for initial launch.

---

## Pricing Tiers (Reference)

Common pricing tiers for reference (you'll select from Apple's predefined tiers):

**Monthly Subscription:**
- Tier 1: $0.99/month
- Tier 2: $1.99/month
- Tier 3: $2.99/month
- Tier 4: $4.99/month
- Tier 5: $9.99/month
- Tier 6: $14.99/month
- Tier 7: $19.99/month

**Yearly Subscription:**
- Typically 10-12x the monthly price
- Example: If monthly is $9.99, yearly could be $99.99 (10 months) or $79.99 (8 months, offering discount)

**Recommendation:** Start with Tier 5 ($9.99/month) or Tier 6 ($14.99/month) for monthly, and adjust yearly pricing to offer a 15-20% discount.

---

## Notes

1. **Product IDs must match exactly** with the ones in `constants/products.ts`:
   - `com.river.memq.monthly`
   - `com.river.memq.yearly`

2. **Subscription Group:** Create the subscription group first, then add both products to the same group.

3. **Review Process:** After creating products, they need to be submitted for review along with your app.

4. **Sandbox Testing:** Use Sandbox test accounts to test purchases before going live.

5. **Pricing:** You can change pricing later, but it requires a new submission for review.
