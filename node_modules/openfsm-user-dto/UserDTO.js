class UserDTO {
  constructor({ id, email, password, name, created, updated, blocked, verification_code }) {
    this._id = id;
    this._email = email;
    this._password = password;
    this._name = name;
    this._created = created;
    this._updated = updated;
    this._blocked = blocked;
    this._verificationCode = verification_code;
  }

  // Getters
  getId() {
    return this._id;
  }

  getEmail() {
    return this._email;
  }

  getPassword() {
    return this._password;
  }

  getName() {
    return this._name;
  }

  getCreated() {
    return this._created;
  }

  getUpdated() {
    return this._updated;
  }

  getBlocked() {
    return this._blocked;
  }

  getVerificationCode() {
    return this._verificationCode;
  }

  // Setters
  setId(id) {
    this._id = id;
  }

  setEmail(email) {
    this._email = email;
  }

  setPassword(password) {
    this._password = password;
  }

  setName(name) {
    this._name = name;
  }

  setCreated(created) {
    this._created = created;
  }

  setUpdated(updated) {
    this._updated = updated;
  }

  setBlocked(blocked) {
    this._blocked = blocked;
  }

  setVerificationCode(verificationCode) {
    this._verificationCode = verificationCode;
  }
}

module.exports = { UserDTO };
