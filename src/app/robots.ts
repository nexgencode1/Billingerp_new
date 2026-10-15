import type { MetadataRoute } from "next";

// The app itself is private and login-gated, so every route stays
// disallowed — except the public marketing landing page at "/".
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/sales", "/purchase", "/products", "/inventory", "/customers", "/suppliers", "/crm", "/hr", "/manufacturing", "/expenses", "/payments", "/cash-bank", "/reports", "/users", "/roles", "/settings", "/login", "/api"],
    },
  };
}
