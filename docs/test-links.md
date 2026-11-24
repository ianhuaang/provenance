# Phase 1 test links

Goal: 20 real links, each checked by hand. A good set mixes tiers and retailers:
designer pieces (and their replicas), brand-designed items, retailer house names, generic marketplace items, affiliate links.

| # | Link | Expected | Result | Cost | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | go.shopmy.us/p-109879172 | Crosley Levi CF4229-ML, brand-designed; UO promo blocked | Fixture | | Affiliate redirect; needs browser adapter if fetch is blocked |
| 2 | urbanoutfitters.com/shop/otto-floor-lamp | Adesso Orchard 3932-12, brand-designed, renamed; UO $269.40 with free Rewards | Fixture | | |
| 3 | elegalight.com/products/pop-glass-table-lamp | Generic: same lamp sold as Oria, Marxel, Zaviera, Portia, Sorcha; input store sold out; Ember $124.95 cheapest verified | Fixture `pop` | | Found via Google Lens; added sold-out handling and the `epik` tracking param |
| 4 | allmodern.com/.../allmodern-keira-floor-lamp-a111545869 | Livabliss (Surya) Desota DES-001, renamed by AllModern; likely match; AllModern $229 verified, Overstock $191 unconfirmed | Fixture `keira` | | Found via Google Lens; confirm DES-001 on a Surya page |
| 5 | | Designer piece (e.g. a Herman Miller or Vitra listing) | | | |
| 6 | | Replica of #5 from a marketplace | | | |
| 6 | | Amazon generic item sold under several names | | | |
| 7 | | West Elm or CB2 item | | | |
| 8 | | Article or Floyd item | | | |
| 9 | | Item on sale with a code | | | |
| 10 | | Vintage or resale-heavy item | | | |
| 11–20 | | | | | |

Lesson from 3 and 4: reverse image search (Google Lens) found the real product in one step where text search failed. The engine needs an image-search step; candidates are SerpApi's Google Lens API or a browser session.
