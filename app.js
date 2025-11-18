// =============================
// Frontend App (Vue)
// =============================

const app = Vue.createApp({
  data() {
    return {
      // Your backend API base URL
      apiBase: "https://learn-app-backend-3.onrender.com/api",

      // Which page the user is viewing
      view: "subjects",

      // Search text
      searchQuery: "",

      // Sorting for subjects page (matches HTML: subjectsSortDir)
      subjectsSortDir: "asc",

      // Sorting for locations page (matches HTML: sortOption + sortDir)
      sortOption: "location",
      sortDir: "asc",

      // Data loaded from the backend
      lessons: [],

      // The subject the user clicked
      selectedSubject: null,

      // Shopping cart
      cart: [],

      // Checkout form
      customer: { name: "", phone: "" },

      // Success message after order
      orderMessage: "",

      // Live search suggestions
      suggestions: []
    };
  },

  // =========================================
  // Computed Properties (auto-calculated)
  // =========================================
  computed: {
    // Filter + sort subjects
    orderedFilteredLessons() {
      const term = this.searchQuery.toLowerCase();

      // Filter based on subject or city match
      const filtered = this.lessons.filter(lesson => {
        const subjectMatch = lesson.subject.toLowerCase().includes(term);
        const cityMatch = lesson.locations.some(l =>
          l.city.toLowerCase().includes(term)
        );
        return term === "" || subjectMatch || cityMatch;
      });

      // Sort A-Z or Z-A
      const sorted = filtered.sort((a, b) =>
        a.subject.localeCompare(b.subject)
      );

      return this.subjectsSortDir === "asc" ? sorted : sorted.reverse();
    },

    // Sort locations inside selected subject
    sortedLocations() {
      if (!this.selectedSubject) return [];

      const arr = [...this.selectedSubject.locations];
      const dir = this.sortDir === "asc" ? 1 : -1;

      return arr.sort((a, b) => {
        let aVal, bVal;

        if (this.sortOption === "location") {
          aVal = a.city.toLowerCase();
          bVal = b.city.toLowerCase();
        } else if (this.sortOption === "price") {
          aVal = a.price;
          bVal = b.price;
        } else if (this.sortOption === "spaces") {
          aVal = a.spaces;
          bVal = b.spaces;
        } else if (this.sortOption === "subject") {
          // all locations share the same subject, but we keep this for completeness
          aVal = this.selectedSubject.subject.toLowerCase();
          bVal = this.selectedSubject.subject.toLowerCase();
        }

        if (aVal > bVal) return 1 * dir;
        if (aVal < bVal) return -1 * dir;
        return 0;
      });
    },

    // Group cart items by subject + city
    groupedCart() {
      const groups = {};

      for (const item of this.cart) {
        const key = item.subject + "-" + item.city;

        if (!groups[key]) {
          groups[key] = { ...item, quantity: 0 };
        }
        groups[key].quantity++;
      }

      return Object.values(groups);
    },

    cartCount() {
      return this.cart.length;
    },

    cartTotal() {
      return this.cart.reduce((sum, item) => sum + item.price, 0);
    },

    isCheckoutValid() {
      const nameOK = /^[a-zA-Z ]+$/.test(this.customer.name);
      const phoneOK = /^[0-9]+$/.test(this.customer.phone);
      return nameOK && phoneOK && this.cart.length > 0;
    }
  },

  // =============================
  // Methods
  // =============================
  methods: {
    // Change view/page
    go(page) {
      this.view = page;
    },

    // Backend URL for images
    backendOrigin() {
      const u = new URL(this.apiBase);
      return u.origin;
    },

    // Convert "images/maths.png" → backend full URL
    imageUrl(src) {
      if (!src) return "";

      // If it's already an absolute URL, just return it
      if (/^https?:\/\//i.test(src)) {
        return src;
      }

      // If it's "images/..." from the DB, prepend backend origin
      if (src.startsWith("images/")) {
        return `${this.backendOrigin()}/${src}`;
      }

      return src;
    },

    // Load lessons from backend
    async loadLessons() {
      try {
        const res = await fetch(`${this.apiBase}/lessons`);
        if (!res.ok) throw new Error("Failed");
        this.lessons = await res.json();
      } catch (err) {
        alert("Could not load lessons");
      }
    },

    // When user selects a subject
    selectSubject(lesson) {
      this.selectedSubject = lesson;
      this.view = "locations";
    },

    // Add one seat to cart
    addToCart(loc) {
      if (loc.spaces <= 0) return;

      loc.spaces--;
      this.cart.push({
        subject: this.selectedSubject.subject,
        city: loc.city,
        price: loc.price
      });
    },

    // Remove a single cart item
    removeOne(item) {
      const index = this.cart.findIndex(
        i => i.subject === item.subject && i.city === item.city
      );
      if (index !== -1) {
        this.cart.splice(index, 1);

        // restore space
        const lesson = this.lessons.find(l => l.subject === item.subject);
        const loc = lesson.locations.find(l => l.city === item.city);
        loc.spaces++;
      }
    },

    // Remove all of that item
    removeAll(item) {
      const count = item.quantity;

      // Filter cart
      this.cart = this.cart.filter(
        i => !(i.subject === item.subject && i.city === item.city)
      );

      // Restore spaces
      const lesson = this.lessons.find(l => l.subject === item.subject);
      const loc = lesson.locations.find(l => l.city === item.city);
      loc.spaces += count;
    },

    // Checkout logic
    async checkout() {
      if (!this.isCheckoutValid) return;

      const order = {
        name: this.customer.name,
        phone: this.customer.phone,
        items: this.groupedCart,
        total: this.cartTotal
      };

      try {
        const res = await fetch(`${this.apiBase}/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order)
        });

        if (!res.ok) throw new Error("Order failed");

        // Update DB lesson spaces
        for (const item of this.groupedCart) {
          const lesson = this.lessons.find(l => l.subject === item.subject);
          const loc = lesson.locations.find(l => l.city === item.city);

          await fetch(`${this.apiBase}/lessons`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: item.subject,
              city: item.city,
              spaces: loc.spaces
            })
          });
        }

        this.orderMessage = "Order submitted!";
        this.cart = [];
        this.customer = { name: "", phone: "" };
        this.view = "checkout";

      } catch (err) {
        alert("Error submitting order");
      }
    },

    // Live search suggestions
    updateSuggestions() {
      const term = this.searchQuery.toLowerCase();
      if (!term) {
        this.suggestions = [];
        return;
      }

      const subjects = this.lessons
        .map(l => l.subject)
        .filter(s => s.toLowerCase().includes(term));

      const cities = this.lessons
        .flatMap(l => l.locations.map(loc => loc.city))
        .filter(c => c.toLowerCase().includes(term));

      // Remove duplicates + limit
      this.suggestions = [...new Set([...subjects, ...cities])].slice(0, 6);
    },

    applySuggestion(text) {
      this.searchQuery = text;
      this.suggestions = [];
    }
  },

  // Load lessons at page start
  mounted() {
    this.loadLessons();
  }
});

// Mount app to HTML
app.mount("#app");
