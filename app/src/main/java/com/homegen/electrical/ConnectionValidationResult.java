package com.homegen.electrical;

public final class ConnectionValidationResult {
    private final boolean valid;
    private final String message;

    private ConnectionValidationResult(boolean valid, String message) {
        this.valid = valid;
        this.message = message;
    }

    public static ConnectionValidationResult ok() {
        return new ConnectionValidationResult(true, "OK");
    }

    public static ConnectionValidationResult invalid(String message) {
        return new ConnectionValidationResult(false, message);
    }

    public boolean isValid() {
        return valid;
    }

    public String getMessage() {
        return message;
    }
}
