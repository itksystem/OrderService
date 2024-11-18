class AccountDTO {
  constructor({ account_id, user_id, balance, created_at, updated_at }) {
    this._accountId = account_id;
    this._userId = user_id;
    this._balance = balance;
    this._createdAt = created_at;
    this._updatedAt = updated_at;
  }

  // Getters
  getAccountId() {
    return this._accountId;
  }

  getUserId() {
    return this._userId;
  }

  getBalance() {
    return this._balance;
  }

  getCreatedAt() {
    return this._createdAt;
  }

  getUpdatedAt() {
    return this._updatedAt;
  }

  // Setters
  setAccountId(accountId) {
    this._accountId = accountId;
  }

  setUserId(userId) {
    this._userId = userId;
  }

  setBalance(balance) {
    this._balance = balance;
  }

  setCreatedAt(createdAt) {
    this._createdAt = createdAt;
  }

  setUpdatedAt(updatedAt) {
    this._updatedAt = updatedAt;
  }
}

module.exports = AccountDTO;
