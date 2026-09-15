import { VueQueryPlugin } from "@tanstack/vue-query";
import { createApp } from "vue";

import App from "@/App.vue";
import "@/assets/tailwind.css";
import { authKey, createAuth } from "@/composables/useAuth.js";
import { confirmationKey, createConfirmation } from "@/composables/useConfirm.js";
import { createToast, toastKey } from "@/composables/useToast.js";
import { showFrontendError } from "@/frontend-error.js";
import { resetImagePrefetch } from "@/imagePrefetch.js";
import { createVideosQueryClient } from "@/queries.js";
import { router } from "@/router.js";

const app = createApp(App);
const queryClient = createVideosQueryClient();
const auth = createAuth({
  onSessionChange: () => {
    queryClient.clear();
    resetImagePrefetch();
  },
});
void auth.initialize();

app.provide(authKey, auth);
app.provide(confirmationKey, createConfirmation());
app.provide(toastKey, createToast());
app.config.errorHandler = (error, _instance, info) => {
  showFrontendError(error, window.location.href, info);
};
app.use(VueQueryPlugin, { queryClient });
app.use(router).mount("#app");
app.onUnmount(auth.dispose);
