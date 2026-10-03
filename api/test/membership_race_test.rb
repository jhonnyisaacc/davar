require "test_helper"
class MembershipRaceTest < ActiveSupport::TestCase
  self.use_transactional_tests = false
  test "competing leaders cannot accept the same person into two assemblies" do
    profile = {experience:"experienced", city:"City", gender:"male", visibility_reviewed:true, answers:(1..7).to_h { |n| [n.to_s,true] }}
    users = 3.times.map { User.create!(display_name:"Race fixture", profile:profile) }
    reader, first, second = users
    assemblies = [first,second].map { |leader| Assembly.create!(name:"Race fixture",kind:"online",leader:leader) }
    memberships = assemblies.map { |assembly| AssemblyMemberships.request!(reader,assembly) }
    ready, start, outcomes = Queue.new, Queue.new, Queue.new
    threads = memberships.map do |membership|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          start.pop
          begin
            AssemblyMemberships.decide!(membership.assembly.leader, membership, "accepted")
            outcomes << "accepted"
          rescue DomainError => error
            outcomes << error.code
          end
        end
      end
    end
    2.times { ready.pop }
    2.times { start << true }
    threads.each(&:join)
    assert_equal ["accepted","already_member_elsewhere"], 2.times.map { outcomes.pop }.sort
    assert_equal 1, reader.memberships.where(state:"member").count
  ensure
    threads&.each(&:join)
    assemblies&.each(&:destroy!)
    users&.each(&:destroy!)
  end
end
