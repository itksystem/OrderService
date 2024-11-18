class RoleDTO {
  constructor(roleCode, description) {
    this._roleCode = roleCode;
    this._description = description;
  }

  getRoleCode() {
    return this._roleCode;
  }

  setRoleCode(roleCode) {
    if (typeof roleCode === 'string') {
      this._roleCode = roleCode;
    } else {
      throw new Error("Role code must be a string");
    }
  }

  getDescription(){
    return this._description ;
  }

  setDescription(description){
    if (typeof description === 'string') {
      this._description = description;
    } else {
      throw new Error("Role description must be a string");
    }
  }
}

class PermissionDTO {
  constructor(permCode, description) {
    this._permCode = permCode;
    this._description = description;
  }

  getPermCode() {
    return this._permCode;
  }

  setPermCode(permCode) {
    if (typeof permCode === 'string') {
      this._permCode = permCode;
    } else {
      throw new Error("Permission code must be a string");
    }
  }
  getDescription(){
    return this._description ;
  }

  setDescription(description){
    if (typeof description === 'string') {
      this._description = description;
    } else {
      throw new Error("Permission description must be a string");
    }
  }
}

class UserPermissionsDTO {
  constructor(roles = [], permissions = []) {
    this._roles = roles; // Массив экземпляров RoleDTO
    this._permissions = permissions; // Массив экземпляров PermissionDTO
  }

  // Геттеры для roles и permissions
  getRoles() {
    return this._roles.map(role => ({ roleCode: role.getRoleCode(), description: role.getDescription()  }));
  }

  getPermissions() {
    return this._permissions.map(permission => ({ permissionCode: permission.getPermCode(),  description: permission.getDescription()  }));
  }

  // Сеттеры для roles и permissions
  setRoles(roles) {
    if (Array.isArray(roles)) {
      this._roles = roles.map(role => new RoleDTO(role));
    } else {
      throw new Error("Roles must be an array of RoleDTO instances or strings");
    }
  }

  setPermissions(permissions) {
    if (Array.isArray(permissions)) {
      this._permissions = permissions.map(permission => new PermissionDTO(permission, description));
    } else {
      throw new Error("Permissions must be an array of PermissionDTO instances or strings");
    }
  }

 

}

// Экспорт класса
module.exports = { UserPermissionsDTO, RoleDTO, PermissionDTO };
