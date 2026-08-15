import "server-only";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { hasFeature, type FeatureKey } from "@/lib/features";

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  return { user, response: null };
}

/**
 * Use this at every API mutation boundary. UI visibility is not an access
 * control: a signed-in user can call an endpoint directly.
 */
export async function requireApiPermission(permission: Permission) {
  const result = await requireApiUser();
  if (!result.user) return result;
  if (!can(result.user.role, permission)) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "You do not have permission to perform this action." },
        { status: 403 },
      ),
    };
  }
  return result;
}

/**
 * Clinical signatures are personal acts. Prescription issuance is role-neutral,
 * but the signed-in user must have a real name and their own professional
 * registration number. A clinic registration number must never be substituted
 * for the individual who signed the prescription.
 */
export async function requireApiClinicalSigner(
  permission: "signClinical" | "correctClinical" | "issuePrescription" = "signClinical",
) {
  const result = permission === "issuePrescription"
    ? await requireApiFeature("clinical")
    : await requireApiFeature("clinical", permission);
  if (!result.user) return result;
  if (permission === "issuePrescription" && !result.user.fullName?.trim()) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Add the prescriber's name to the signed-in staff profile before issuing prescriptions." },
        { status: 403 },
      ),
    };
  }
  if (
    permission === "issuePrescription" &&
    !result.user.registrationNumber?.trim()
  ) {
    return {
      user: null,
      response: NextResponse.json(
        {
          error: "Add your professional registration number to your prescriber profile before issuing or correcting a prescription. The clinic registration number cannot be used as a personal signature.",
          action: "/dashboard/prescriptions/profile",
        },
        { status: 403 },
      ),
    };
  }
  return result;
}

/** API equivalent of requireFeature. Feature access stays independent of roles. */
export async function requireApiFeatures(
  features: readonly FeatureKey[],
  permission?: Permission,
) {
  const result = permission
    ? await requireApiPermission(permission)
    : await requireApiUser();
  if (!result.user) return result;
  for (const feature of features) {
    if (!(await hasFeature(result.user.clinicId, feature))) {
      return {
        user: null,
        response: NextResponse.json(
          {
            error: `The ${feature.replaceAll("_", " ")} module is not enabled for this clinic. Contact your ConphiDent administrator.`,
            feature,
          },
          { status: 403 },
        ),
      };
    }
  }
  return result;
}

export async function requireApiFeature(
  feature: FeatureKey,
  permission?: Permission,
) {
  return requireApiFeatures([feature], permission);
}
