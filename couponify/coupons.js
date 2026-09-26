/*
 * Coupon data. Edit this file to add, change, or remove stores and offers,
 * then redeploy.
 *
 * Every link below goes to the store's OWN official deals / coupons page
 * (US sites, checked September 2026). Those pages always show whatever the
 * store is running right now, so they don't go stale the way codes do.
 *
 * Two kinds of offer:
 *   Promo code:  { code: "SAVE10", title, details, expires, verified }
 *   Deal link:   { title, details, url, expires }          (no code)
 *
 * Store fields:  id, name, category, url (store home / main deals page), color
 * Offer fields:  expires is "YYYY-MM-DD" or "" — expired offers hide themselves.
 *                verified: true only for codes YOU have tested at checkout.
 */
window.COUPON_DATA = {
  siteName: "Couponify",
  tagline: "Official deals and promo codes from the stores you already shop.",
  stores: [
    // ---- Everything stores ----
    {
      id: "amazon", name: "Amazon", category: "Everything", color: "#232f3e",
      url: "https://www.amazon.com/deals",
      coupons: [
        { title: "Today's Deals", details: "Deals of the day, lightning deals and limited-time sales.", url: "https://www.amazon.com/deals" }
      ]
    },
    {
      id: "walmart", name: "Walmart", category: "Everything", color: "#0071ce",
      url: "https://www.walmart.com/shop/deals/top-deals",
      coupons: [
        { title: "Flash Deals", details: "Limited-time price drops across the store.", url: "https://www.walmart.com/shop/deals/flash-deals" },
        { title: "Rollbacks & savings", details: "Everyday lowered prices by department.", url: "https://www.walmart.com/shop/savings" },
        { title: "Clearance", details: "Marked-down items while supplies last.", url: "https://www.walmart.com/shop/deals/clearance" }
      ]
    },
    {
      id: "target", name: "Target", category: "Everything", color: "#cc0000",
      url: "https://www.target.com/c/top-deals/-/N-4xw74",
      coupons: [
        { title: "Top Deals", details: "Current sales on toys, electronics, home and more.", url: "https://www.target.com/c/top-deals/-/N-4xw74" },
        { title: "Target Circle Deals", details: "Extra member deals with free Target Circle.", url: "https://www.target.com/c/top-deals/target-circle-deals/-/N-4xw74Zuj3xg" },
        { title: "Deal of the Day", details: "A new Target Circle deal every 24 hours.", url: "https://www.target.com/c/target-deal-of-the-day/-/N-2sbk4" }
      ]
    },
    {
      id: "costco", name: "Costco", category: "Everything", color: "#005daa",
      url: "https://www.costco.com/deals-of-the-day.html",
      coupons: [
        { title: "Deals of the Day", details: "Member prices on name-brand products. Membership required.", url: "https://www.costco.com/deals-of-the-day.html" },
        { title: "Warehouse coupon offers", details: "Current member coupon book savings.", url: "https://www.costco.com/featured-warehouse-coupon-offers.html" }
      ]
    },
    {
      id: "ebay", name: "eBay", category: "Everything", color: "#e53238",
      url: "https://www.ebay.com/deals",
      coupons: [
        { title: "Daily Deals", details: "Discounts with free shipping, updated daily.", url: "https://www.ebay.com/deals" }
      ]
    },

    // ---- Electronics ----
    {
      id: "best-buy", name: "Best Buy", category: "Electronics", color: "#0046be",
      url: "https://www.bestbuy.com/top-deals",
      coupons: [
        { title: "Top Deals", details: "Featured offers on TVs, laptops, phones and appliances.", url: "https://www.bestbuy.com/top-deals" },
        { title: "Deal of the Day", details: "A new discounted item every day.", url: "https://www.bestbuy.com/site/misc/deal-of-the-day/pcmcat248000050016.c?id=pcmcat248000050016" }
      ]
    },
    {
      id: "samsung", name: "Samsung", category: "Electronics", color: "#1428a0",
      url: "https://www.samsung.com/us/shop/all-deals/",
      coupons: [
        { title: "All deals", details: "Limited-time offers on phones, TVs, appliances and more.", url: "https://www.samsung.com/us/shop/all-deals/" },
        { title: "Up to $200 off select Galaxy S26+ and S26 Ultra", details: "Samsung.com or the Shop Samsung app, while supplies last.", url: "https://www.samsung.com/us/shop/featured-offers/", expires: "2026-09-27" },
        { title: "Up to 30% off for students, military & more", details: "Samsung's Offer Program — verification required.", url: "https://www.samsung.com/us/shop/offer-program/" }
      ]
    },
    {
      id: "dell", name: "Dell", category: "Electronics", color: "#007db8",
      url: "https://www.dell.com/en-us/shop/deals/dc",
      coupons: [
        { title: "Top Deals", details: "Current laptop, desktop and monitor deals.", url: "https://www.dell.com/en-us/shop/deals/dc" },
        { title: "Dell coupons & offers", details: "Dell's own list of current promo codes.", url: "https://www.dell.com/en-us/lp/dell-coupons-codes" },
        { title: "Dell Outlet", details: "Certified refurbished and scratch-and-dent deals.", url: "https://www.dell.com/en-us/dfh/lp/outlet-deals" }
      ]
    },
    {
      id: "newegg", name: "Newegg", category: "Electronics", color: "#f7a100",
      url: "https://www.newegg.com/todays-deals",
      coupons: [
        { title: "Shell Shocker & today's deals", details: "Limited-time electronics and PC parts deals, new daily.", url: "https://www.newegg.com/todays-deals" },
        { title: "Email promo codes", details: "Newegg's current emailed promo codes.", url: "https://www.newegg.com/promotions/NEemail/latest/index-landing.html" }
      ]
    },

    // ---- Clothing & shoes ----
    {
      id: "nike", name: "Nike", category: "Clothing", color: "#111111",
      url: "https://www.nike.com/w/sale-3yaep",
      coupons: [
        { title: "Nike sale", details: "Discounted shoes, clothing and accessories.", url: "https://www.nike.com/w/sale-3yaep" }
      ]
    },
    {
      id: "adidas", name: "adidas", category: "Clothing", color: "#000000",
      url: "https://www.adidas.com/us/sale",
      coupons: [
        { title: "adidas sale", details: "Current sale — no code needed.", url: "https://www.adidas.com/us/sale" },
        { title: "adidas promotions & codes", details: "adidas's own coupons page, including sign-up and student offers.", url: "https://www.adidas.com/us/promotions" }
      ]
    },
    {
      id: "gap", name: "Gap", category: "Clothing", color: "#002f6c",
      url: "https://www.gap.com/page/coupons-promo-codes?cid=1114393",
      coupons: [
        { title: "Gap coupons & promo codes", details: "Gap's current codes and offers.", url: "https://www.gap.com/page/coupons-promo-codes?cid=1114393" }
      ]
    },
    {
      id: "old-navy", name: "Old Navy", category: "Clothing", color: "#003764",
      url: "https://oldnavy.gap.com/page/coupons-promo-codes?cid=1114260",
      coupons: [
        { title: "Old Navy coupons & promo codes", details: "Online codes and printable in-store coupons.", url: "https://oldnavy.gap.com/page/coupons-promo-codes?cid=1114260" },
        { title: "Today's Deals", details: "Daily family clothing deals.", url: "https://oldnavy.gap.com/browse/todays-deals?cid=1183117" }
      ]
    },
    {
      id: "hm", name: "H&M", category: "Clothing", color: "#e50010",
      url: "https://www2.hm.com/en_us/women/sale/view-all.html",
      coupons: [
        { title: "H&M women's sale", details: "Marked-down clothing, shoes and accessories.", url: "https://www2.hm.com/en_us/women/sale/view-all.html" }
      ]
    },
    {
      id: "macys", name: "Macy's", category: "Clothing", color: "#e21a2c",
      url: "https://www.macys.com/shop/sale/deals-coupons?id=334356",
      coupons: [
        { title: "Macy's deals, coupons & promotions", details: "Macy's current codes, flash sales and offers.", url: "https://www.macys.com/shop/sale/deals-coupons?id=334356" }
      ]
    },
    {
      id: "kohls", name: "Kohl's", category: "Clothing", color: "#860038",
      url: "https://www.kohls.com/sale-event/todays-deals.jsp",
      coupons: [
        { title: "Kohl's coupons & today's deals", details: "Kohl's current codes. Up to four promo codes can be combined per order.", url: "https://www.kohls.com/sale-event/todays-deals.jsp" }
      ]
    },

    // ---- Beauty ----
    {
      id: "ulta", name: "Ulta Beauty", category: "Beauty", color: "#f15a22",
      url: "https://www.ulta.com/promotion/all",
      coupons: [
        { code: "FRAG15", title: "15% off fragrance", details: "Published on Ulta's promotions page. CHANEL excluded.", expires: "2026-09-28" },
        { title: "Current offers & promotions", details: "All of Ulta's live sales and coupons.", url: "https://www.ulta.com/promotion/all" },
        { title: "Ulta coupons", details: "Ulta's own coupon codes page.", url: "https://www.ulta.com/promotion/coupon" }
      ]
    },
    {
      id: "sephora", name: "Sephora", category: "Beauty", color: "#000000",
      url: "https://www.sephora.com/beauty/beauty-offers",
      coupons: [
        { title: "Sephora beauty offers", details: "Weekly promo codes, free samples and trial sizes.", url: "https://www.sephora.com/beauty/beauty-offers" }
      ]
    },

    // ---- Home ----
    {
      id: "home-depot", name: "The Home Depot", category: "Home", color: "#f96302",
      url: "https://www.homedepot.com/c/Savings_Center",
      coupons: [
        { title: "Deal of the Day", details: "Daily Special Buys on tools, appliances and décor.", url: "https://www.homedepot.com/SpecialBuy/SpecialBuyOfTheDay" },
        { title: "Home Depot coupons", details: "Home Depot's current coupons and offers.", url: "https://www.homedepot.com/c/coupons" }
      ]
    },
    {
      id: "lowes", name: "Lowe's", category: "Home", color: "#004990",
      url: "https://www.lowes.com/l/savings",
      coupons: [
        { title: "Daily Deals", details: "New deals every day on tools, décor and more.", url: "https://www.lowes.com/l/savings/daily-deals" },
        { title: "Lowe's coupons", details: "Lowe's current discounts and promo codes.", url: "https://www.lowes.com/l/savings/coupons" }
      ]
    },
    {
      id: "wayfair", name: "Wayfair", category: "Home", color: "#7f187f",
      url: "https://www.wayfair.com/daily-sales",
      coupons: [
        { title: "All daily sales", details: "Rotating furniture and décor sales.", url: "https://www.wayfair.com/daily-sales" },
        { title: "Clearance & open box", details: "Discounted furniture and décor.", url: "https://www.wayfair.com/daily-sales/clearance" }
      ]
    },
    {
      id: "ikea", name: "IKEA", category: "Home", color: "#0058a3",
      url: "https://www.ikea.com/us/en/offers/",
      coupons: [
        { title: "IKEA Offers Hub", details: "Current deals, new lower prices and IKEA Family offers.", url: "https://www.ikea.com/us/en/offers/" },
        { title: "15% off for students", details: "One-time code after verifying student status.", url: "https://www.ikea.com/us/en/offers/", expires: "2026-09-30" }
      ]
    },

    // ---- Travel ----
    {
      id: "expedia", name: "Expedia", category: "Travel", color: "#1e243a",
      url: "https://www.expedia.com/deals",
      coupons: [
        { title: "Travel deals", details: "Hotel, flight and package deals, plus member prices.", url: "https://www.expedia.com/deals" },
        { title: "Expedia coupons", details: "Expedia's current coupon and promo codes.", url: "https://www.expedia.com/lp/b/coupons" }
      ]
    },
    {
      id: "booking", name: "Booking.com", category: "Travel", color: "#003580",
      url: "https://www.booking.com/deals/index.html",
      coupons: [
        { title: "Hotel deals", details: "Current Booking.com hotel and stay deals.", url: "https://www.booking.com/deals/index.html" },
        { title: "Genius loyalty discounts", details: "Free sign-up for instant discounts at many properties.", url: "https://www.booking.com/genius.html" }
      ]
    }
  ]
};
