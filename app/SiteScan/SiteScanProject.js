/**
 *
 * SiteScanProject
 *  - Site Scan Project
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  12/2/2020 - 2.0.0 -
 * Modified:
 *
 */
define([
  "esri/core/Accessor",
  "esri/core/Collection",
  "./SiteScanMission"
], function(Accessor, Collection, SiteScanMission){

  const SiteScanProject = Accessor.createSubclass({
    declaredClass: "SiteScanProject",

    properties: {
      missions: {
        type: Collection.ofType(SiteScanMission)
      }
    }

  });
  SiteScanProject.version = "2.0.0";

  return SiteScanProject;
});
