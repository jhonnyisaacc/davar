class DevelopmentMailboxDelivery
  def initialize(*)
  end
  def deliver!(mail)
    DevelopmentSandbox.require_enabled!
    raise "Sandbox email recipients must use example.test" unless mail.to.present? && mail.to.all? { |address| address.end_with?("@example.test") }
    directory = Rails.root.join("tmp/sandbox-mail")
    FileUtils.mkdir_p(directory, mode: 0700)
    id = SecureRandom.uuid
    path = directory.join("#{id}.json")
    File.write(path, JSON.generate(id: id, to: mail.to, subject: mail.subject, body: mail.body.decoded, created_at: Time.current.iso8601), perm: 0600)
  end
end
