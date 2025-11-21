// ===================================
// Lessons App Frontend (Vue 3)
// ===================================

const app = Vue.createApp({
  data() {
    return {
      // Backend API base (adjust if needed)
      apiBase: "https://learn-app-backend-3.onrender.com/api",

      // Which page is shown: "lessons" or "cart"
      view: "lessons",

      // Search text (search as you type)
      searchQuery: "",

      // Sorting options
      // attribute: "subject", "location", "price", "spaces"
      sortAttribute: "subject",
      sortDir: "asc",

      // List of lessons loaded from backend
      // Each lesson: { subject, location, price, spaces, image }
      lessons: [],

      // Cart holds 1 entry per seat added
      // { subject, location, price }
      cart: [],

      // Checkout form
      customer: {
        name: "",
        phone: ""
      },

      // Confirmation message after checkout
      orderMessage: ""
    };
  },

  computed: {
    // Lessons after search + sort
    displayedLessons() {
      const term = this.searchQuery.toLowerCase();
      let filtered = [];

      // 1. Filter - full-text search
      for (const lesson of this.lessons) {
        if (!term) {
          filtered.push(lesson);
          continue;
        }

        const subjectText  = (lesson.subject  || "").toLowerCase();
        const locationText = (lesson.location || "").toLowerCase();
        const priceText    = String(lesson.price  || "").toLowerCase();
        const spacesText   = String(lesson.spaces || "").toLowerCase();

        if (
          subjectText.includes(term)  ||
          locationText.includes(term) ||
          priceText.includes(term)    ||
          spacesText.includes(term)
        ) {
          filtered.push(lesson);
        }
      }

      // 2. Sort
      filtered.sort((a, b) => {
        const aVal = this.getSortValue(a);
        const bVal = this.getSortValue(b);

        if (aVal > bVal) return 1;
        if (aVal < bVal) return -1;
        return 0;
      });

      if (this.sortDir === "desc") {
        filtered.reverse();
      }

      return filtered;
    },

    // Number of items in cart
    cartCount() {
      return this.cart.length;
    },

    // Group cart items by subject + location for display and checkout
    groupedCart() {
      const groups = {};

      for (const item of this.cart) {
        const key = item.subject + "|" + item.location;

        if (!groups[key]) {
          groups[key] = {
            subject: item.subject,
            location: item.location,
            price: item.price,
            quantity: 0
          };
        }

        groups[key].quantity += 1;
      }

      return Object.values(groups);
    },

    // Total cart price
    cartTotal() {
      let total = 0;
      for (const item of this.groupedCart) {
        total += item.price * item.quantity;
      }
      return total;
    },

    // Checkout validation: name letters only, phone numbers only + cart not empty
    isCheckoutValid() {
      const nameOK  = /^[A-Za-z ]+$/.test(this.customer.name);
      const phoneOK = /^[0-9]+$/.test(this.customer.phone);
      return nameOK && phoneOK && this.cart.length > 0;
    }
  },

  methods: {
    // Change page
    go(page) {
      this.view = page;
    },

    // Helper to get value used for sorting
    getSortValue(lesson) {
      if (this.sortAttribute === "subject") {
        return (lesson.subject || "").toLowerCase();
      }
      if (this.sortAttribute === "location") {
        return (lesson.location || "").toLowerCase();
      }
      if (this.sortAttribute === "price") {
        return lesson.price || 0;
      }
      if (this.sortAttribute === "spaces") {
        return lesson.spaces || 0;
      }
      return 0;
    },

    // Build full image URL if using backend images
    backendOrigin() {
      try {
        return new URL(this.apiBase).origin;
      } catch {
        return "";
      }
    },

    imageUrl(src) {
      if (!src) return "";
      if (src.startsWith("images/")) {
        return this.backendOrigin() + "/" + src;
      }
      return src;
    },

    // Load lessons from backend 
    async loadLessons() {
      try {
        const res = await fetch(this.apiBase + "/lessons");
        if (!res.ok) throw new Error("Failed to fetch lessons");
        const data = await res.json();

        // Expecting: [{ subject, location, price, spaces, image }, ...]
        this.lessons = data;
      } catch (err) {
        console.error("Could not load lessons:", err);
        alert("Could not load lessons.");
      }
    },

    // Add one seat to cart
    addToCart(lesson) {
      if (!lesson || lesson.spaces <= 0) return;

      // Decrease spaces in lesson
      lesson.spaces -= 1;

      // Add to cart
      this.cart.push({
        subject: lesson.subject,
        location: lesson.location,
        price: lesson.price
      });
    },

    // Remove a seat for a given subject+location
    // and add that space back to the lesson list
    removeOne(groupItem) {
      // 1. Remove one matching item from cart
      const index = this.cart.findIndex(
        (c) =>
          c.subject === groupItem.subject &&
          c.location === groupItem.location
      );

      if (index !== -1) {
        this.cart.splice(index, 1);
      }

      // 2. Increase spaces back in lessons list
      const lesson = this.lessons.find(
        (l) =>
          l.subject === groupItem.subject &&
          l.location === groupItem.location
      );
      if (lesson) {
        lesson.spaces += 1;
      }
    },

    // Checkout: send order to backend and update spaces
    async checkout() {
      if (!this.isCheckoutValid) return;

      const order = {
        name: this.customer.name,
        phone: this.customer.phone,
        items: this.groupedCart, // subject, location, price, quantity
        total: this.cartTotal
      };

      try {
        // 1. Send order
        const res = await fetch(this.apiBase + "/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order)
        });

        if (!res.ok) throw new Error("Order failed");

        // 2. Update spaces in DB for each grouped item
        for (const item of this.groupedCart) {
          const lesson = this.lessons.find(
            (l) =>
              l.subject === item.subject &&
              l.location === item.location
          );
          if (!lesson) continue;

          await fetch(this.apiBase + "/lessons", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: item.subject,
              location: item.location,
              spaces: lesson.spaces
            })
          });
        }

        // 3. Clear cart and form, show message
        this.orderMessage = "Order submitted!";
        this.cart = [];
        this.customer = { name: "", phone: "" };

        // Reload lessons from DB (in case spaces changed on server)
        await this.loadLessons();
      } catch (err) {
        console.error("Error submitting order:", err);
        alert("There was a problem submitting your order.");
      }
    }
  },

  mounted() {
    this.loadLessons();
  }
});

app.mount("#app");
