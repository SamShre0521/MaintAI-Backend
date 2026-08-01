import "dotenv/config";
import mongoose from "mongoose";

import Company from "../models/company.model.js";
import User from "../models/user.model.js";
import Machine from "../models/machine.model.js";
import Session from "../models/session.model.js";
import Feedback from "../models/feedback.model.js";
import KnowledgeBase from "../models/knowledgeBase.model.js";

async function run() {
  await mongoose.connect(process.env.MONGO_DB_URL);

  const company = await Company.findOneAndUpdate(
    { slug: "maintai-uat-company" },
    {
      name: "MaintAI UAT Company",
      slug: "maintai-uat-company",
      isActive: true,
    },
    {
      upsert: true,
      returnDocument: "after",
    },
  );

  const companyId = company._id;

  await Promise.all([
    User.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } },
    ),
    Machine.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } },
    ),
    Session.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } },
    ),
    Feedback.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } },
    ),
    KnowledgeBase.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } },
    ),
  ]);

  console.log("UAT company migration completed");
  console.log("Company ID:", companyId.toString());

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});