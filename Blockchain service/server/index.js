import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectDB } from "./config/db.js";
import kycRoutes from "./routes/kycRoutes.js";
import fraudRoutes from "./routes/fraudRoutes.js";

dotenv.config();

const app = express();
const configuredPort = Number(process.env.PORT || 5000);
const maxPortRetries = Number(process.env.PORT_RETRY_COUNT || 3);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*"
  })
);
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "VeriChainKYC API" });
});

app.use("/kyc", kycRoutes);
app.use("/fraud", fraudRoutes);

async function start() {
  try {
    await connectDB(process.env.MONGODB_URI);

    let attempt = 0;
    let activePort = configuredPort;

    const tryListen = () => {
      const server = app.listen(activePort, () => {
        console.log(`Server running on port ${activePort}`);
      });

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE" && attempt < maxPortRetries) {
          attempt += 1;
          activePort += 1;
          console.warn(`Port in use, retrying on ${activePort}...`);
          tryListen();
          return;
        }

        console.error("Startup failed:", error.message);
        process.exit(1);
      });
    };

    tryListen();
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

start();
