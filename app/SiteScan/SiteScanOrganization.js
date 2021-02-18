/**
 *
 * SiteScanOrganization
 *  - Site Scan Organization
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  12/2/2020 - 2.0.0 -
 * Modified:
 *
 */
define([
  "esri/core/Accessor",
  "esri/core/Collection",
  "./SiteScanProject"
], function(Accessor, Collection, SiteScanProject){

  const SiteScanOrganization = Accessor.createSubclass({
    declaredClass: "SiteScanOrganization",

    properties: {
      projects: {
        type: Collection.ofType(SiteScanProject)
      }
    }

  });
  SiteScanOrganization.version = "2.0.0";

  return SiteScanOrganization;
});
