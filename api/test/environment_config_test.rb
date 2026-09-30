require "test_helper"
require "open3"
require "rbconfig"

class EnvironmentConfigTest < ActiveSupport::TestCase
  def hosted_environment(name)
    {
      "RAILS_ENV" => name,
      "DATABASE_URL" => "postgresql://127.0.0.1/davar_v2_#{name}",
      "SECRET_KEY_BASE" => SecureRandom.hex(64),
      "ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY" => SecureRandom.hex(32),
      "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY" => SecureRandom.hex(32),
      "ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT" => SecureRandom.hex(32),
      "API_PUBLIC_URL" => "https://api.#{name}.example.org",
      "API_HOSTS" => "api.#{name}.example.org",
      "WEB_ORIGINS" => "https://#{name}.example.org",
      "AUTH_RETURN_URIS" => "https://#{name}.example.org/commentary"
    }
  end

  test "staging and production boot with production protections and isolated databases" do
    %w[staging production].each do |name|
      code = <<~RUBY
        config = Rails.application.config
        database = ActiveRecord::Base.configurations.configs_for(env_name: Rails.env).first.configuration_hash[:database]
        puts JSON.generate(environment: Rails.env.to_s, database: database, ssl: config.force_ssl, reload: config.enable_reloading, eager: config.eager_load, local_errors: config.consider_all_requests_local)
      RUBY
      output, error, status = Open3.capture3(hosted_environment(name), RbConfig.ruby, Rails.root.join("bin/rails").to_s, "runner", code)
      assert status.success?, error
      result = JSON.parse(output.lines.last)
      assert_equal name, result["environment"]
      assert_equal "davar_v2_#{name}", result["database"]
      assert_equal true, result["ssl"]
      assert_equal true, result["eager"]
      assert_equal false, result["reload"]
      assert_equal false, result["local_errors"]
    end
  end

  test "both hosted environments reject local encryption fallback and missing database" do
    %w[staging production].each do |name|
      env = hosted_environment(name)
      env["ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY"] = nil
      _, error, status = Open3.capture3(env, RbConfig.ruby, Rails.root.join("bin/rails").to_s, "runner", "puts 'unexpected boot'")
      assert_not status.success?
      assert_includes error, "ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY is required"
      env = hosted_environment(name).merge("DATABASE_URL" => nil)
      _, error, status = Open3.capture3(env, RbConfig.ruby, Rails.root.join("bin/rails").to_s, "runner", "puts 'unexpected boot'")
      assert_not status.success?
      assert_includes error, "Missing #{name} configuration: DATABASE_URL"
    end
  end
  test "hosted API URLs require HTTPS" do
    %w[staging production].each do |name|
      env = hosted_environment(name).merge("API_PUBLIC_URL" => "http://api.#{name}.example.org")
      _, error, status = Open3.capture3(env, RbConfig.ruby, Rails.root.join("bin/rails").to_s, "runner", "puts 'unexpected boot'")
      assert_not status.success?
      assert_includes error, "API_PUBLIC_URL must use HTTPS in #{name}"
    end
  end

  test "staging and production reject sandbox configuration" do
    %w[staging production].each do |name|
      env = hosted_environment(name).merge("DAVAR_DEV_SANDBOX" => "1")
      _, error, status = Open3.capture3(env, RbConfig.ruby, Rails.root.join("bin/rails").to_s, "runner", "puts 'unexpected boot'")
      assert_not status.success?
      assert_includes error, "DAVAR_DEV_SANDBOX is development-only"
    end
  end

end
