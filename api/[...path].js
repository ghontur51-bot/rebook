import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const app = require("../server/rebook-api.cjs");

export default app;
