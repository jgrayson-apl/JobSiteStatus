/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

define([
  "require",
  "esri/identity/OAuthInfo",
  "esri/identity/IdentityManager",
  "esri/portal/Portal",
  "dojo/text!config/applicationBase.json",
  "dojo/text!config/application.json",
  "ApplicationBase/ApplicationBase",
  "./Main"
], function(require, OAuthInfo, IdentityManager, Portal,
            applicationBaseConfig, applicationConfig, ApplicationBase, Application){

  const portalSettings = {}

  const appConfig = JSON.parse(applicationConfig);
  if(appConfig.oauthappid && appConfig.oauthappid.length){
    const info = new OAuthInfo({ appId: appConfig.oauthappid, popup: true });
    IdentityManager.registerOAuthInfos([info]);
    portalSettings.authMode = "immediate";
  }

  const portal = new Portal(portalSettings);
  portal.load().then(() => {

    new ApplicationBase({
      config: applicationConfig,
      settings: applicationBaseConfig
    }).load().then(function(base){
      const Main = new Application();
      return Main.init(base);
    });

  });
});
