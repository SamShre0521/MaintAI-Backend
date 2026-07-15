import User from "../models/user.model.js";

export const registerDeviceToken = async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token || !platform) {
      return res.status(400).json({
        error: "token and platform are required",
      });
    }

    if (!["android", "ios", "web"].includes(platform)) {
      return res.status(400).json({
        error: "Invalid platform",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    user.deviceTokens = user.deviceTokens.filter(
      (item) => item.token !== token,
    );

    user.deviceTokens.push({
      token,
      platform,
      updatedAt: new Date(),
    });

    await user.save();

    return res.status(200).json({
      message: "Device token registered successfully",
    });
  } catch (error) {
    console.error("Register device token error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const unregisterDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: "token is required",
      });
    }

    await User.updateOne(
      {
        _id: req.user._id,
      },
      {
        $pull: {
          deviceTokens: {
            token,
          },
        },
      },
    );

    return res.status(200).json({
      message: "Device token removed successfully",
    });
  } catch (error) {
    console.error("Unregister device token error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};