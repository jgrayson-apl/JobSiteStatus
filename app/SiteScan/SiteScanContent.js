/**
 *
 * SiteScanContent
 *  - Site Scan Content
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  12/8/2020 - 2.0.0 -
 * Modified:
 *
 */
define([
  "esri/core/Accessor",
  "./SiteScanAPI",
  "./SiteScanUser"
], function(Accessor, SiteScanAPI, SiteScanUser){

  const siteScanAPI = new SiteScanAPI({});

  const SiteScanContent = Accessor.createSubclass({
    declaredClass: "SiteScanContent",

    properties: {
      user: {
        type: SiteScanUser
      }
    },

    /**
     *
     * @param userEmail
     * @param userPassword
     */
    signIn: function(userEmail, userPassword){
      siteScanAPI.signIn(userEmail, userPassword).then(siteScanUser => {
        this.user = siteScanUser;
      }).catch(error=>{
        this.user = null;
      });
    }

  });
  SiteScanContent.version = "2.0.0";

  return SiteScanContent;
});
