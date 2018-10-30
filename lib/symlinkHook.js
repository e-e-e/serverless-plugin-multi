const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const yaml = require('js-yaml');
const utils = require('./utils');


function writeTempServerlessConfig(folder, name, service, config) {
  const plugins = config.functions ? [...service.plugins] : [];
  const index = plugins.indexOf('serverless-multi');
  if (index >= 0) {
    plugins.splice(index, 1);
  }
  const serviceClone = _.cloneDeep(service);

  const tmpYamlData =  _.merge({
    custom: serviceClone.custom,
    package: serviceClone.package,
    provider: _.omit(serviceClone.provider, 'iamRoleStatements'),
    service: serviceClone.serviceObject,
    resources: serviceClone.resources,
    functions: serviceClone.functions,
    plugins,
  }, config);
  if (tmpYamlData.provider.iamRoleStatements) {
    const roles = serviceClone.provider.iamRoleStatements;
    roles.forEach((role) => {
      const exists = tmpYamlData.provider.iamRoleStatements.find(existingRole => _.isEqual(existingRole, role));
      if (!exists) {
        tmpYamlData.provider.iamRoleStatements.push(role);
      }
    });
  } else {
    tmpYamlData.provider.iamRoleStatements = serviceClone.provider.iamRoleStatements;
  }
  // for custom domain names plugin
  if (tmpYamlData.custom.customDomain && !_.get(config, 'custom.customDomain.basePath')) {
    tmpYamlData.custom.customDomain.basePath = _.kebabCase(name);
  }
  // rename based on directory and base config
  const mainServiceName = typeof serviceClone.service === 'string' ? serviceClone.service : serviceClone.serviceClone.name;
  tmpYamlData.service = `${mainServiceName}-${name}`;
  const tempYamlPath = path.join(folder, 'serverless.yaml');
  fs.writeFileSync(tempYamlPath, yaml.safeDump(tmpYamlData, { skipInvalid: true }));
}

function createSymLinks(service, destination) {
  const workingDir = process.cwd();
  const symlinks = ['node_modules'].concat(service.custom.multi.symlinks);
  const relative = path.relative(destination, workingDir);
  process.chdir(destination);
  symlinks.forEach((link) => {
    const target = path.resolve(relative, link);
    try {
      fs.symlinkSync(target, path.join('./', link));
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  });
  process.chdir(workingDir);
}

const generateYamlAndSymlinks = (serverless, options) => {
  serverless.cli.log(`Generating serviceless.yml and symlinks for service`);
  const mainService = serverless.service;
  const serviceFilePath = utils.getServerlessConfigFile();
  return serverless.yamlParser.parse(serviceFilePath)
    .then((primaryConfig) => {
      return utils.iterateOverServices(serverless, options, (config, name, folder) => {
        serverless.cli.log(`Generating serviceless.yml and symlinks for service ${name}`);
        // make links from this service to the main service
        createSymLinks(mainService, folder);
        writeTempServerlessConfig(folder, name, primaryConfig, config);
      });
    });
};

module.exports = {
  generateYamlAndSymlinks,
  createSymLinks,
  writeTempServerlessConfig,
};
