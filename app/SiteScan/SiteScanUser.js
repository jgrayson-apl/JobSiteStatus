/**
 *
 * SiteScanUser
 *  - Site Scan User
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  12/2/2020 - 2.0.0 -
 * Modified:
 *
 */
define([
  "esri/core/Accessor",
  "esri/core/Collection",
  "./SiteScanOrganization"
], function(Accessor, Collection, SiteScanOrganization){

  const SiteScanUser = Accessor.createSubclass({
    declaredClass: "SiteScanUser",

    properties: {
      token: { type: String },
      id: { type: String },
      name: { type: String },
      email: { type: String },
      active: { type: Boolean },
      admin: { type: Boolean },
      createdAt: { type: Date },
      updatedAt: { type: Date },
      siteScanAdmin: { type: Boolean },
      userAdmin: { type: Boolean },
      verified: { type: Boolean },
      organizations: {
        type: Collection.ofType(SiteScanOrganization)
      }
    }

  });
  SiteScanUser.version = "2.0.0";

  return SiteScanUser;
});
