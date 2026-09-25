/*
 * Coupon data. Edit this file to add, change, or remove stores and codes,
 * then redeploy. Everything below is SAMPLE data — replace it with real
 * stores and codes you have verified before you publish.
 *
 * Store fields:  id, name, category, url (where "Shop now" goes), color (logo bg)
 * Coupon fields: code, title, details, expires ("YYYY-MM-DD" or ""), verified (true/false)
 */
window.COUPON_DATA = {
  siteName: "Couponify",
  tagline: "Find a working promo code before you check out.",
  stores: [
    {
      id: "sample-outfitters",
      name: "Sample Outfitters",
      category: "Clothing",
      url: "https://example.com",
      color: "#e76f51",
      coupons: [
        { code: "WELCOME15", title: "15% off your first order", details: "New customers only. Excludes sale items.", expires: "2026-12-31", verified: true },
        { code: "FREESHIP", title: "Free shipping on $50+", details: "Standard shipping, US only.", expires: "", verified: true },
        { code: "FALL20", title: "20% off outerwear", details: "Jackets and coats category.", expires: "2026-11-30", verified: false }
      ]
    },
    {
      id: "demo-electronics",
      name: "Demo Electronics",
      category: "Electronics",
      url: "https://example.com",
      color: "#264653",
      coupons: [
        { code: "SAVE10NOW", title: "$10 off $100+", details: "One use per customer.", expires: "2026-10-31", verified: true },
        { code: "AUDIO25", title: "25% off headphones", details: "Select brands.", expires: "", verified: false }
      ]
    },
    {
      id: "placeholder-home",
      name: "Placeholder Home & Garden",
      category: "Home",
      url: "https://example.com",
      color: "#2a9d8f",
      coupons: [
        { code: "NEST30", title: "30% off bedding", details: "Sheets, duvets and pillows.", expires: "2026-12-15", verified: true },
        { code: "GROW5", title: "$5 off plants", details: "Minimum spend $25.", expires: "", verified: true }
      ]
    },
    {
      id: "test-beauty",
      name: "Test Beauty Co.",
      category: "Beauty",
      url: "https://example.com",
      color: "#b5838d",
      coupons: [
        { code: "GLOW20", title: "20% sitewide", details: "Excludes gift cards.", expires: "2026-10-15", verified: true },
        { code: "SAMPLEGIFT", title: "Free gift with purchase", details: "While supplies last.", expires: "", verified: false }
      ]
    },
    {
      id: "example-eats",
      name: "Example Eats Delivery",
      category: "Food",
      url: "https://example.com",
      color: "#f4a261",
      coupons: [
        { code: "FIRSTBITE", title: "$15 off first delivery", details: "Orders of $30 or more.", expires: "", verified: true }
      ]
    },
    {
      id: "mock-travel",
      name: "Mock Travel",
      category: "Travel",
      url: "https://example.com",
      color: "#457b9d",
      coupons: [
        { code: "TRIP50", title: "$50 off hotel bookings", details: "Stays of 3+ nights.", expires: "2027-03-01", verified: false },
        { code: "FLYAWAY", title: "10% off flights", details: "Economy fares only.", expires: "2026-12-31", verified: true }
      ]
    }
  ]
};
