# Stage Deadworks joins from live server requirements

Steam discovers live servers, and the registry adds country and version by address, while the selected server supplies current maps and addons via A2S_RULES. Treat its artifact metadata as untrusted and apply transport and size limits before staging maps in citadel/maps and addons in citadel/deadworks_addons/vpks. The unadvertised UI bootstrap comes from the Deadworks API and has a separate managed mount.
