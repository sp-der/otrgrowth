import {
  businessProfileSchema,
  workspaceSchema,
  type BusinessProfile,
  type Workspace,
} from "../domain/schemas";
export const OTR_ID = "00000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function emptyProfile(name = ""): BusinessProfile {
  return businessProfileSchema.parse({
    businessName: name,
    industry: "",
    description: "",
    services: "",
    location: "",
    website: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    targetCustomer: "",
    customerProblem: "",
    usp: "",
    brandVoice: "",
    brandPersonality: "",
    brandStyle: "",
    primaryGoal: "",
    secondaryGoals: "",
    typicalOffer: "",
    averageCustomerValue: "",
    competitors: "",
    additionalContext: "",
  });
}
const at = "2026-09-13T12:00:00.000Z";
export function seedWorkspace(): Workspace {
  return workspaceSchema.parse({
    version: 1,
    selectedBusinessId: OTR_ID,
    businesses: [
      {
        id: OTR_ID,
        number: 1,
        createdAt: at,
        updatedAt: at,
        profile: {
          ...emptyProfile("OTR Services"),
          industry: "Creative & web services",
          description:
            "OTR Services builds custom websites, manages websites, and creates design and branding for businesses.",
          services: "Website building\nWebsite management\nDesign / branding",
          website: "https://otrservicesie.com",
          instagram: "otrservicesie",
          brandVoice: "Confident, direct, modern, business-first.",
          brandPersonality: "Premium, energetic, practical, polished.",
          brandStyle:
            "Dark gray and black with restrained purple accents. Premium creative-studio aesthetic, crisp typography, motion-led presentation, clean spacing, and subtle depth.",
          usp: "BUILT TO REPRESENT YOUR BUSINESS RIGHT.",
          creativeDNA: {
            primaryColor: "#050505",
            secondaryColor: "#FFFFFF",
            accentColor: "#6D28D9",
            headingFont: "Helvetica",
            bodyFont: "Helvetica",
            pacing: "Fast",
            visualStyle: "Bold",
            brandMood: "Modern, premium, energetic, clean, technology-forward",
            transitionStyle: "Punchy",
            motionIntensity: "High",
            preferredTextStyle: "Short confident statements, strong hierarchy, minimal copy",
            ctaStyle: "Bold",
            logoTreatment: "End card only",
            musicVibe: "Modern electronic, confident, minimal, clean percussion",
            footageStyle: "Crisp mobile-first website showcases, browser-style cards, and fast portfolio reveals",
            referenceAdNotes:
              "Instagram Reel creative should feel like a polished agency spot, not a slideshow. Lead with a strong hook, move quickly through portfolio proof, and finish on the OTR positioning line and handle.",
            wordsToFavor: "built, represent, business, website, brand, custom",
            wordsToAvoid: "cheap, template, guaranteed, best",
          },
          additionalContext:
            "OTR Services portfolio: Pressed In Pink (pressedinpink.com), Pacific Stay Properties (pacificstayproperties.com), JMB 2 Creations (jmb2creations.com), and Muerto De Hambre Grill (mdhgrill.com). For portfolio ads, show the range of industries and emphasize custom website building, ongoing management, and design/branding. Instagram: @otrservicesie.",
        },
      },
    ],
    content: [
      {
        id: id(10),
        businessId: OTR_ID,
        title: "Your website should work as hard as you do.",
        kind: "Reel",
        channel: "Instagram",
        body: "Concept: open on a slow, confusing website. Cut to a clean mobile experience. Show the journey from first impression to a clear inquiry button. End frame: Built to represent your business right. CTA: Let’s talk about your website.",
        status: "In review",
        scheduledFor: "2026-09-16",
      },
      {
        id: id(11),
        businessId: OTR_ID,
        title: "Good work deserves a better first impression.",
        kind: "Caption",
        channel: "Instagram",
        body: "Your business puts in the work. Your website should show it. OTR Services brings website building, ongoing management, and branding together so your online presence feels like you. Ready for a site that represents your business right? Send us a message.",
        status: "In review",
        scheduledFor: "2026-09-18",
      },
      {
        id: id(12),
        businessId: OTR_ID,
        title: "The 5-second website check",
        kind: "Idea",
        channel: "Facebook",
        body: "Carousel idea: Can a new visitor tell what you do, who you help, and how to contact you in five seconds? Walk through those three questions using an illustrative homepage.",
        status: "Idea",
        scheduledFor: "",
      },
      {
        id: id(13),
        businessId: OTR_ID,
        title: "Behind the build: the details that matter",
        kind: "Reel",
        channel: "Instagram",
        body: "A short screen recording of mobile spacing, navigation, and the contact flow. Explain one design decision in each cut. Use only portfolio footage approved for sharing.",
        status: "Approved",
        scheduledFor: "2026-09-21",
      },
      {
        id: id(14),
        businessId: OTR_ID,
        title: "Launch day is just the beginning.",
        kind: "Caption",
        channel: "Facebook",
        body: "A website needs attention after launch, too. From content updates to keeping the experience consistent, OTR Services helps your site keep pace with your business. Message us to discuss website management.",
        status: "Draft",
        scheduledFor: "2026-09-23",
      },
    ],
    campaigns: [
      {
        id: id(20),
        businessId: OTR_ID,
        name: "Built to represent you",
        objective: "Generate qualified website project inquiries",
        audience:
          "Proposed audience: local service businesses with an outdated website or no clear inquiry path. Confirm geography before launch.",
        offer:
          "Start a conversation about your website project. Scope and pricing to be confirmed.",
        channel: "Meta · Instagram & Facebook",
        adCopy:
          "You built a business worth showing up for. Let’s build a website that does the same. Websites, management, and branding by OTR Services. Tell us what you’re building.",
        creativeStatus: "Concept",
        status: "Draft",
      },
    ],
    creatives: [
      {
        id: id(21),
        businessId: OTR_ID,
        campaignId: id(20),
        title: "First impression / next impression",
        concept:
          "A split-screen website transformation using authorized portfolio footage. End on the OTR positioning statement.",
        format: "Video",
        status: "Concept",
      },
    ],
    metrics: [
      {
        id: id(30),
        businessId: OTR_ID,
        source: "demo",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-13",
        spend: 240,
        impressions: 32000,
        clicks: 640,
        leads: 24,
        customers: 3,
        revenue: 1800,
      },
    ],
    strategies: [],
    activity: [
      {
        id: id(40),
        businessId: OTR_ID,
        title: "Demo workspace prepared for OTR Services",
        at,
      },
      {
        id: id(41),
        businessId: OTR_ID,
        title: "Sample campaign added as a draft",
        at,
      },
      {
        id: id(42),
        businessId: OTR_ID,
        title: "Two sample content pieces ready for review",
        at,
      },
    ],
  });
}
